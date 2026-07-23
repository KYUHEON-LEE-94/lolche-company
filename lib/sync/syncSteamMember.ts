// lib/sync/syncSteamMember.ts
// 스팀 동기화. /steam 페이지는 DB 만 읽으므로 Steam API 호출은 전부 여기(크론/온디맨드)에서만 일어난다.
import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchOwnedGames, fetchPlayerSummaries, type SteamPlayerSummary } from '@/lib/steam/api'
import { fetchAppMultiplayer } from '@/lib/steam/appDetails'

/** communityvisibilitystate 3 = 전체 공개 */
export const STEAM_VISIBILITY_PUBLIC = 3

const MEMBER_DELAY_MS = Number(process.env.STEAM_MEMBER_DELAY_MS ?? '400')
/** 비공식 store API 라 간격을 넉넉히 둔다 */
const APP_DETAIL_DELAY_MS = Number(process.env.STEAM_APP_DETAIL_DELAY_MS ?? '1500')
/** 1회 실행에서 신규 판정할 앱 수 상한 (나머지는 다음 크론에서) */
const APP_DETAIL_BATCH = Number(process.env.STEAM_APP_DETAIL_BATCH ?? '40')

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export type SteamMemberRow = {
  id: string
  member_name: string
  steam_id64: string
}

export type SteamSyncResult = {
  memberId: string
  memberName: string
  ok: boolean
  gameCount: number
  message: string | null
}

/** 승인된 멤버 중 스팀을 연결한 사람만 동기화 대상이다. */
export async function listSteamMembers(limit?: number): Promise<SteamMemberRow[]> {
  let q = supabaseAdmin
    .from('members')
    .select('id, member_name, steam_id64')
    .eq('status', 'approved')
    .not('steam_id64', 'is', null)
    .order('id', { ascending: true })

  if (limit && limit > 0) q = q.limit(limit)

  const { data, error } = await q
  if (error) throw new Error(error.message)

  return (data ?? [])
    .filter((m): m is SteamMemberRow => typeof m.steam_id64 === 'string' && m.steam_id64.length > 0)
}

async function upsertApps(games: { appid: number; name: string | null }[]) {
  if (games.length === 0) return

  // 같은 배치 안 중복 appid 는 upsert 가 거부하므로 미리 제거한다.
  const byId = new Map<number, { appid: number; name: string | null }>()
  for (const g of games) byId.set(g.appid, g)

  // appid/name 만 보내므로 ON CONFLICT UPDATE 가 is_multiplayer 를 건드리지 않는다.
  const rows = [...byId.values()]
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin
      .from('steam_apps')
      .upsert(rows.slice(i, i + 500), { onConflict: 'appid' })
    if (error) throw new Error(error.message)
  }
}

async function replaceOwnedGames(
  memberId: string,
  games: { appid: number; playtime_forever: number; playtime_2weeks: number }[],
) {
  const nowIso = new Date().toISOString()

  const { error: delError } = await supabaseAdmin
    .from('steam_owned_games')
    .delete()
    .eq('member_id', memberId)
  if (delError) throw new Error(delError.message)

  if (games.length === 0) return

  const rows = games.map((g) => ({
    member_id: memberId,
    appid: g.appid,
    playtime_forever: g.playtime_forever,
    playtime_2weeks: g.playtime_2weeks,
    updated_at: nowIso,
  }))

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabaseAdmin.from('steam_owned_games').insert(rows.slice(i, i + 500))
    if (error) throw new Error(error.message)
  }
}

async function applySummary(memberId: string, summary: SteamPlayerSummary | undefined) {
  if (!summary) return
  await supabaseAdmin
    .from('members')
    .update({
      steam_persona: summary.personaname || null,
      steam_avatar_url: summary.avatarfull || null,
      steam_visibility: summary.communityvisibilitystate,
    })
    .eq('id', memberId)
}

async function finish(memberId: string, errorMessage: string | null) {
  await supabaseAdmin
    .from('members')
    .update({
      steam_synced_at: new Date().toISOString(),
      steam_sync_error: errorMessage,
    })
    .eq('id', memberId)
}

/**
 * 멤버 목록을 순차 동기화한다.
 * 한 멤버의 실패가 배치 전체를 중단시키지 않는다.
 */
export async function syncSteamMembers(members: SteamMemberRow[]): Promise<SteamSyncResult[]> {
  if (members.length === 0) return []

  const summaries = new Map<string, SteamPlayerSummary>()
  try {
    const list = await fetchPlayerSummaries(members.map((m) => m.steam_id64))
    for (const s of list) summaries.set(s.steamid, s)
  } catch (e) {
    console.error('[sync-steam] summaries 실패', e instanceof Error ? e.message : '오류 발생')
  }

  const results: SteamSyncResult[] = []

  for (const m of members) {
    const summary = summaries.get(m.steam_id64)
    try {
      await applySummary(m.id, summary)

      if (summary && summary.communityvisibilitystate !== STEAM_VISIBILITY_PUBLIC) {
        // 비공개 프로필은 보유 게임을 못 읽는다. 기존 캐시를 지워 오래된 정보가 남지 않게 한다.
        await replaceOwnedGames(m.id, [])
        await finish(m.id, '프로필 비공개')
        results.push({
          memberId: m.id,
          memberName: m.member_name,
          ok: true,
          gameCount: 0,
          message: '프로필 비공개',
        })
        continue
      }

      const games = await fetchOwnedGames(m.steam_id64)
      if (games === null) {
        await replaceOwnedGames(m.id, [])
        await finish(m.id, '게임 상세정보 비공개')
        results.push({
          memberId: m.id,
          memberName: m.member_name,
          ok: true,
          gameCount: 0,
          message: '게임 상세정보 비공개',
        })
        continue
      }

      await upsertApps(games.map((g) => ({ appid: g.appid, name: g.name })))
      await replaceOwnedGames(m.id, games)
      await finish(m.id, null)

      results.push({
        memberId: m.id,
        memberName: m.member_name,
        ok: true,
        gameCount: games.length,
        message: null,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : '오류 발생'
      console.error('[sync-steam] member 실패', { memberId: m.id, message })
      await finish(m.id, message).catch(() => undefined)
      results.push({
        memberId: m.id,
        memberName: m.member_name,
        ok: false,
        gameCount: 0,
        message,
      })
    }

    if (MEMBER_DELAY_MS > 0) await sleep(MEMBER_DELAY_MS)
  }

  return results
}

/** 아직 멀티플레이 판정을 안 한 앱을 소량씩 백필한다. 실패해도 동기화 전체는 성공으로 둔다. */
export async function backfillAppDetails(limit = APP_DETAIL_BATCH): Promise<number> {
  if (limit <= 0) return 0

  const { data, error } = await supabaseAdmin
    .from('steam_apps')
    .select('appid')
    .is('details_checked_at', null)
    .limit(limit)

  if (error) {
    console.error('[sync-steam] steam_apps 조회 실패', error.message)
    return 0
  }

  let checked = 0
  for (const app of data ?? []) {
    const appid = Number(app.appid)
    if (!Number.isFinite(appid)) continue

    const result = await fetchAppMultiplayer(appid)
    // 실패(null)일 때도 details_checked_at 을 찍어 무한 재시도를 막는다.
    // 값 자체는 null 로 남아 UI 에서 "분류 미확인" 으로 표기된다.
    const { error: updateError } = await supabaseAdmin
      .from('steam_apps')
      .update({
        is_multiplayer: result.isMultiplayer,
        category_ids: result.categoryIds,
        details_checked_at: new Date().toISOString(),
      })
      .eq('appid', appid)

    if (updateError) console.error('[sync-steam] steam_apps 갱신 실패', updateError.message)
    else checked += 1

    if (APP_DETAIL_DELAY_MS > 0) await sleep(APP_DETAIL_DELAY_MS)
  }

  return checked
}

/** 스팀 ID 최초 등록 직후 그 멤버 1명만 즉시 반영한다. */
export async function syncSteamMemberById(memberId: string): Promise<SteamSyncResult | null> {
  const { data, error } = await supabaseAdmin
    .from('members')
    .select('id, member_name, steam_id64')
    .eq('id', memberId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data || typeof data.steam_id64 !== 'string' || !data.steam_id64) return null

  const [result] = await syncSteamMembers([
    { id: data.id, member_name: data.member_name, steam_id64: data.steam_id64 },
  ])
  return result ?? null
}
