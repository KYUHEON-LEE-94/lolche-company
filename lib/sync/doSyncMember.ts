import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { SyncError } from '@/lib/sync/syncMember'
import {
  fetchPuuid,
  fetchTftLeaguesByPuuid,
  fetchLolPuuid,
  fetchLolLeaguesByPuuid,
  fetchMatchIdsByPuuid,
  fetchMatchById,
  warnRiotOnce,
  LOL_SOLO_QUEUE,
  RiotApiError,
  type LolLeagueEntry,
} from '@/lib/riot/api'
import { LOL_ENABLED } from '@/lib/constants/features'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import {
  listRiotAccounts,
  mirrorPrimaryToMember,
  pickPrimaryAccount,
} from '@/lib/members/primaryAccount'
import type { RiotAccount } from '@/types/supabase'

const RIOT_MATCH_DETAIL_DELAY_MS = Number(process.env.RIOT_MATCH_DETAIL_DELAY_MS ?? '1200')
const RIOT_ACCOUNT_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '800')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type LeagueEntry = Awaited<ReturnType<typeof fetchTftLeaguesByPuuid>>[number]

type AccountSnapshot = {
  puuid: string
  solo: LeagueEntry | null
  doubleUp: LeagueEntry | null
}

/**
 * puuid 확보 → TFT 리그 조회. puuid가 만료(400)되면 Riot ID로 한 번 다시 해석한다.
 * 계정 1개당 Riot 호출 1~3회이며, 이 함수만 계정 수에 비례해 늘어난다.
 */
async function fetchAccountLeagues(
  gameName: string,
  tagline: string,
  knownPuuid: string | null,
): Promise<AccountSnapshot> {
  let puuid = knownPuuid ?? (await fetchPuuid(gameName, tagline))

  let leagues: LeagueEntry[]
  try {
    leagues = await fetchTftLeaguesByPuuid(puuid)
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 400) {
      puuid = await fetchPuuid(gameName, tagline)
      leagues = await fetchTftLeaguesByPuuid(puuid)
    } else {
      throw e
    }
  }

  return {
    puuid,
    solo: leagues.find((e) => e.queueType === 'RANKED_TFT') ?? null,
    doubleUp: leagues.find((e) => e.queueType === 'RANKED_TFT_DOUBLE_UP') ?? null,
  }
}

/**
 * LoL 리그 조회. ★ LoL 은 TFT 와 **다른 API 키**를 쓰고, PUUID 는 키에 종속된 암호문이라
 * riot_puuid(TFT 키 기준)를 넘기면 400 이 반환된다. 따라서 lol_puuid 를 따로 발급해 캐시한다.
 *
 * 캐시가 있으면 account-v1 호출이 0회이므로 정상 상태에서 호출 증가량은 없다.
 * 반환값: `null` = 이번 주기 조회 불가(키 없음 / 403 / 재발급 실패) — 기존 저장값을 보존한다.
 */
async function fetchLolSnapshot(
  account: Pick<RiotAccount, 'riot_game_name' | 'riot_tagline' | 'lol_puuid'>,
): Promise<{ entries: LolLeagueEntry[]; puuid: string } | null> {
  let puuid = account.lol_puuid
  if (!puuid) {
    puuid = await fetchLolPuuid(account.riot_game_name, account.riot_tagline)
    if (!puuid) return null
    if (RIOT_ACCOUNT_DELAY_MS > 0) await sleep(RIOT_ACCOUNT_DELAY_MS)
  }

  let entries: LolLeagueEntry[] | null
  try {
    entries = await fetchLolLeaguesByPuuid(puuid)
  } catch (e) {
    // 상태코드만 본다. 'Exception decrypting' 문자열 매칭은 Riot 이 문구를 바꾸면 깨진다.
    if (!(e instanceof RiotApiError && e.status === 400)) throw e

    // 키 교체 등으로 저장된 lol_puuid 가 무효해진 경우. 재발급은 **1회만** 시도한다.
    const reissued = await fetchLolPuuid(account.riot_game_name, account.riot_tagline)
    if (!reissued) return null
    puuid = reissued
    try {
      entries = await fetchLolLeaguesByPuuid(puuid)
    } catch (retryError) {
      if (retryError instanceof RiotApiError && retryError.status === 400) {
        warnRiotOnce(
          'lol-puuid-400',
          '[riot] 재발급한 lol_puuid 로도 400 — RIOT_LOL_API_KEY 설정을 확인하세요. LoL 랭크 수집을 건너뜁니다.',
        )
        return null
      }
      throw retryError
    }
  }

  if (!entries) return null
  return { entries, puuid }
}

function tftColumnsFrom(snapshot: AccountSnapshot) {
  const { solo, doubleUp } = snapshot
  return {
    tft_tier: solo?.tier ?? null,
    tft_rank: solo?.rank ?? null,
    tft_league_points: solo?.leaguePoints ?? null,
    tft_wins: solo?.wins ?? null,
    tft_losses: solo?.losses ?? null,
    tft_doubleup_tier: doubleUp?.tier ?? null,
    tft_doubleup_rank: doubleUp?.rank ?? null,
    tft_doubleup_league_points: doubleUp?.leaguePoints ?? null,
    tft_doubleup_wins: doubleUp?.wins ?? null,
    tft_doubleup_losses: doubleUp?.losses ?? null,
  }
}

export async function doSyncMember(memberId: string) {
  const { data: member, error: memberError } = await supabaseAdmin
    .from('members')
    .select('*')
    .eq('id', memberId)
    .single()

  if (memberError || !member) {
    throw new SyncError('Member not found', 404)
  }

  const listed = await listRiotAccounts(memberId)
  // 마이그레이션 미적용 환경에서 크론이 멈추면 안 되므로 기존 단일 계정 경로로 폴백한다.
  // 테이블은 있는데 조회가 실패한 경우는 진짜 장애이므로 숨기지 않는다.
  if (!listed.ok && !listed.missingTable) throw new SyncError(listed.message, 500)
  const accounts = listed.ok ? listed.accounts : []

  let primarySnapshot: AccountSnapshot
  // LoL 단계에서 재사용한다(pickPrimaryAccount 재호출 방지).
  let primaryAccount: RiotAccount | null = null

  if (accounts.length > 0) {
    const primary = pickPrimaryAccount(accounts)!
    primaryAccount = primary
    let primaryResult: AccountSnapshot | null = null

    for (const [index, account] of accounts.entries()) {
      if (index > 0 && RIOT_ACCOUNT_DELAY_MS > 0) await sleep(RIOT_ACCOUNT_DELAY_MS)

      const snapshot = await fetchAccountLeagues(
        account.riot_game_name,
        account.riot_tagline,
        account.riot_puuid,
      )

      const { error: accountUpdateError } = await supabaseAdmin
        .from('riot_accounts')
        .update({
          riot_puuid: snapshot.puuid,
          ...tftColumnsFrom(snapshot),
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', account.id)
        .eq('member_id', memberId)

      // 23505(다른 멤버가 같은 puuid를 선점)여도 나머지 계정 동기화는 계속한다.
      if (accountUpdateError) console.error('riot_accounts update error', accountUpdateError)

      if (account.id === primary.id) primaryResult = snapshot
    }

    if (!primaryResult) throw new SyncError('Primary riot account sync failed', 500)
    primarySnapshot = primaryResult

    // ★ members 캐시 갱신은 primaryAccount.ts 한 곳에서만 수행한다.
    const mirrored = await mirrorPrimaryToMember(memberId, { recordPrev: true })
    if (!mirrored.ok) throw new SyncError(mirrored.message, 500)
  } else {
    // ── 레거시(riot_accounts 미적용) 경로 ────────────────────────────────
    primarySnapshot = await fetchAccountLeagues(
      member.riot_game_name,
      member.riot_tagline,
      member.riot_puuid,
    )

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from('members')
      .update({
        riot_puuid: primarySnapshot.puuid,
        tft_tier_prev: member.tft_tier,
        tft_rank_prev: member.tft_rank,
        tft_lp_prev: member.tft_league_points,
        ...tftColumnsFrom(primarySnapshot),
      })
      .eq('id', memberId)
      .select('id')

    if (updateError) throw new SyncError(updateError.message, 500)
    if (!updatedRows || updatedRows.length === 0) {
      throw new SyncError('Update affected 0 rows. (RLS blocked or wrong id?)', 403)
    }
  }

  const puuid = primarySnapshot.puuid
  const { solo, doubleUp } = primarySnapshot

  // 히스토리는 대표 계정 값만 기록한다(그래프가 사람 단위이므로 계정별 기록은 섞인다).
  if (solo || doubleUp) {
    const { data: activeSeason } = await supabaseAdmin
      .from('seasons')
      .select('id')
      .eq('is_active', true)
      .maybeSingle()

    const { error: historyError } = await supabaseAdmin
      .from('member_rank_history')
      .insert({
        member_id: memberId,
        tft_tier: solo?.tier ?? null,
        tft_rank: solo?.rank ?? null,
        tft_lp: solo?.leaguePoints ?? null,
        tft_doubleup_tier: doubleUp?.tier ?? null,
        tft_doubleup_rank: doubleUp?.rank ?? null,
        tft_doubleup_lp: doubleUp?.leaguePoints ?? null,
        season_id: activeSeason?.id ?? null,
      })
    if (historyError) console.error('member_rank_history insert error', historyError)
  }

  // LoL 솔로랭크. 플래그가 꺼져 있으면 호출 자체를 하지 않는다(불필요한 호출 낭비 방지).
  // 실패해도 TFT 동기화 결과를 되돌리지 않는다. 대표 계정만 수집한다.
  //
  // ★ 레거시(riot_accounts 미적용) 경로에서는 LoL 단계를 건너뛴다.
  //   lol_puuid 는 riot_accounts 에만 존재하므로 members 만 있는 환경에서는 캐시할 곳이 없고,
  //   매 동기화마다 account-v1 을 태우게 된다. 20260726 적용 환경에서는 도달하지 않는 경로다.
  if (LOL_ENABLED && primaryAccount) {
    const account = primaryAccount
    try {
      const lol = await fetchLolSnapshot(account)
      // null = 조회 불가. 기존 저장값을 null 로 덮어쓰지 않는다.
      if (lol) {
        const lolSolo = lol.entries.find((e) => e.queueType === LOL_SOLO_QUEUE) ?? null
        const lolColumns = {
          lol_tier: lolSolo?.tier ?? null,
          lol_rank: lolSolo?.rank ?? null,
          lol_league_points: lolSolo?.leaguePoints ?? null,
          lol_wins: lolSolo?.wins ?? null,
          lol_losses: lolSolo?.losses ?? null,
          lol_synced_at: new Date().toISOString(),
        }
        // 값이 바뀐 경우에만 lol_puuid 를 payload 에 포함한다.
        const withPuuid =
          account.lol_puuid === lol.puuid ? lolColumns : { ...lolColumns, lol_puuid: lol.puuid }

        const updateLol = (payload: Record<string, string | number | null>) =>
          supabaseAdmin
            .from('riot_accounts')
            .update(payload)
            .eq('id', account.id)
            .eq('member_id', memberId)

        let { error: accountLolError } = await updateLol(withPuuid)
        // 20260729_lol_puuid.sql 미적용이면 42703. 랭크 값만이라도 저장한다(크론이 죽으면 안 된다).
        if (accountLolError && isMissingColumnError(accountLolError)) {
          warnRiotOnce(
            'lol-puuid-column-missing',
            '[sync] riot_accounts.lol_puuid 컬럼이 없습니다 (scripts/sql/20260729_lol_puuid.sql 미적용). 매 동기화마다 PUUID 를 재발급합니다.',
          )
          ;({ error: accountLolError } = await updateLol(lolColumns))
        }

        if (accountLolError) console.error('riot_accounts.lol_* update error', accountLolError)
        else await mirrorPrimaryToMember(memberId)
      }
    } catch (e) {
      console.error(
        `LoL 랭크 동기화 실패 (member ${memberId})`,
        e instanceof Error ? e.message : '오류 발생',
      )
    }
  }

  // 매치 상세는 호출당 대기시간이 길어 동기화 비용의 대부분을 차지한다.
  // 계정 수만큼 늘리면 배치가 maxDuration을 넘기므로 대표 계정만 수집한다.
  const matchIds = await fetchMatchIdsByPuuid(puuid)
  const recentPlacements: number[] = []

  for (const matchId of matchIds) {
    if (RIOT_MATCH_DETAIL_DELAY_MS > 0) await sleep(RIOT_MATCH_DETAIL_DELAY_MS)

    const match = await fetchMatchById(matchId)
    const { metadata, info } = match

    const matchRow = {
      match_id: metadata.match_id,
      data_version: metadata.data_version ?? null,
      game_datetime: info.game_datetime ? new Date(info.game_datetime).toISOString() : null,
      queue_id: info.queue_id ?? null,
      tft_set_number: info.tft_set_number ?? null,
      game_length_seconds: info.game_length != null ? Math.round(info.game_length) : null,
    }

    const { error: matchUpsertError } = await supabaseAdmin
      .from('tft_matches')
      .upsert([matchRow], { onConflict: 'match_id' })

    if (matchUpsertError) {
      console.error('tft_matches upsert error', matchUpsertError)
      continue
    }

    const myPart = info.participants.find((p) => p.puuid === puuid)
    if (!myPart) continue

    recentPlacements.push(myPart.placement ?? 8)

    await supabaseAdmin
      .from('tft_match_participants')
      .delete()
      .eq('match_id', metadata.match_id)
      .eq('member_id', memberId)

    const { error: partInsertError } = await supabaseAdmin
      .from('tft_match_participants')
      .insert([{
        match_id: metadata.match_id,
        member_id: memberId,
        puuid,
        placement: myPart.placement ?? null,
        level: myPart.level ?? null,
        time_eliminated: myPart.time_eliminated ?? null,
        total_damage_to_players: myPart.total_damage_to_players ?? null,
        augments: myPart.augments ?? null,
        traits: myPart.traits ?? null,
        units: myPart.units ?? null,
      }])

    if (partInsertError) console.error('tft_match_participants insert error', partInsertError)
  }

  if (recentPlacements.length > 0) {
    const recent5 = recentPlacements.slice(0, 5).join(',')
    const { error: recentUpdateError } = await supabaseAdmin
      .from('members')
      .update({ tft_recent5: recent5 })
      .eq('id', memberId)

    if (recentUpdateError) console.error('members.tft_recent5 update error', recentUpdateError)
  }
}
