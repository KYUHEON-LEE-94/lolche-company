// app/api/members/[id]/sync/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type {Database} from '@/types/supabase'

// env 가져오기 (서버 전용)
const RIOT_API_KEY = process.env.RIOT_API_KEY
const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const TFT_LEAGUE_BASE_URL = process.env.RIOT_TFT_LEAGUE_BASE_URL
const TFT_MATCH_BASE_URL = process.env.RIOT_TFT_MATCH_BASE_URL

// API 호출 간 딜레이 (ms)
const RIOT_MATCH_DETAIL_DELAY_MS = Number(
    process.env.RIOT_MATCH_DETAIL_DELAY_MS ?? '1200', // 기본 1.2초
)

// sleep 함수
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (!RIOT_API_KEY || !ACCOUNT_BASE_URL || !TFT_LEAGUE_BASE_URL) {
  throw new Error('Riot API env variables are not set')
}

// Riot ID → PUUID
async function fetchPuuid(gameName: string, tagLine: string): Promise<string> {
  const url = `${ACCOUNT_BASE_URL}/${encodeURIComponent(
      gameName,
  )}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`

  const res = await fetch(url, { method: 'GET' })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Account API error (${res.status}): ${text}`)
  }

  const data = await res.json()
  console.log("RIOT_data:", data)
  return data.puuid as string
}


// summonerId → TFT 랭크 정보
type TftLeagueEntry = {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

type RiotMatchMetadata = {
  data_version: string
  match_id: string
  participants: string[]
}

type RiotMatchParticipant = {
  puuid: string
  placement: number
  level: number
  time_eliminated: number
  total_damage_to_players: number
  augments?: unknown[]
  traits?: unknown[]
  units?: unknown[]
}

type RiotMatchInfo = {
  game_datetime: number   // ms timestamp
  game_length: number     // seconds (float)
  queue_id: number
  tft_set_number?: number
  participants: RiotMatchParticipant[]
}

type RiotMatchResponse = {
  metadata: RiotMatchMetadata
  info: RiotMatchInfo
}


async function fetchTftLeaguesByPuuid(
    puuid: string,
): Promise<TftLeagueEntry[]> {
  const url = `${TFT_LEAGUE_BASE_URL}/${encodeURIComponent(
      puuid,
  )}?api_key=${RIOT_API_KEY}`

  const res = await fetch(url, { method: 'GET' })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TFT League API error (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TftLeagueEntry[]
  return data ?? []
}
// PUUID → 최근 matchId들
async function fetchMatchIdsByPuuid(puuid: string, count = 5): Promise<string[]> {
  const url = `${TFT_MATCH_BASE_URL}/matches/by-puuid/${encodeURIComponent(
      puuid,
  )}/ids?start=0&count=${count}&api_key=${RIOT_API_KEY}`

  const res = await fetch(url, { method: 'GET' })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TFT Match IDs API error (${res.status}): ${text}`)
  }

  const data = (await res.json()) as string[]
  return data ?? []
}

// matchId → 상세 매치 정보
async function fetchMatchById(matchId: string): Promise<RiotMatchResponse> {
  const url = `${TFT_MATCH_BASE_URL}/matches/${encodeURIComponent(
      matchId,
  )}?api_key=${RIOT_API_KEY}`

  const res = await fetch(url, { method: 'GET' })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TFT Match Detail API error (${res.status}): ${text}`)
  }

  return (await res.json()) as RiotMatchResponse
}

// POST /api/members/[id]/sync
export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const memberId = id

  // 1) 멤버 조회
  const { data: memberData, error: memberError } = await supabase
  .from('members')
  .select('*')
  .eq('id', memberId)
  .single()

  if (memberError || !memberData) {
    console.error(memberError)
    return NextResponse.json(
        { error: 'Member not found' },
        { status: 404 },
    )
  }

  const member = memberData as Database['public']['Tables']['members']['Row']
  type MemberUpdate = Database['public']['Tables']['members']['Update']

  try {
    // ====== rate limit, last_synced 체크 (선택) ======
    // 예: 10분 이내에 동기화했다면 막기
    if (member.last_synced_at) {
      const last = new Date(member.last_synced_at).getTime()
      const now = Date.now()
      const diffMinutes = (now - last) / 1000 / 60
      if (diffMinutes < 10) {
        return NextResponse.json(
            { message: '최근에 이미 동기화되었습니다.', diffMinutes },
            { status: 429 },
        )
      }
    }

    // 2) PUUID 없으면 Account API로 조회
    let puuid = member.riot_puuid
    if (!puuid) {
      puuid = await fetchPuuid(member.riot_game_name, member.riot_tagline)
    }

    // 3) PUUID → TFT 리그(랭크) 정보 (두 큐 타입 모두)
    const leagues = await fetchTftLeaguesByPuuid(puuid!)

    const solo = leagues.find((e) => e.queueType === 'RANKED_TFT') ?? null
    const doubleUp = leagues.find((e) => e.queueType === 'RANKED_TFT_DOUBLE_UP') ?? null

    let tftTier: string | null = null
    let tftRank: string | null = null
    let tftLeaguePoints: number | null = null
    let tftWins: number | null = null
    let tftLosses: number | null = null

    let tftDoubleupTier: string | null = null
    let tftDoubleupRank: string | null = null
    let tftDoubleupLeaguePoints: number | null = null
    let tftDoubleupWins: number | null = null
    let tftDoubleupLosses: number | null = null

    if (solo) {
      tftTier = solo.tier
      tftRank = solo.rank
      tftLeaguePoints = solo.leaguePoints
      tftWins = solo.wins
      tftLosses = solo.losses
    }

    if (doubleUp) {
      tftDoubleupTier = doubleUp.tier
      tftDoubleupRank = doubleUp.rank
      tftDoubleupLeaguePoints = doubleUp.leaguePoints
      tftDoubleupWins = doubleUp.wins
      tftDoubleupLosses = doubleUp.losses
    }

    // 5) Supabase 업데이트
    const { error: updateError } = await supabase
    .from('members')
    .update({
      riot_puuid: puuid ?? null,
      tft_tier: tftTier,
      tft_rank: tftRank,
      tft_league_points: tftLeaguePoints,
      tft_wins: tftWins,
      tft_losses: tftLosses,
      tft_doubleup_tier: tftDoubleupTier,
      tft_doubleup_rank: tftDoubleupRank,
      tft_doubleup_league_points: tftDoubleupLeaguePoints,
      tft_doubleup_wins: tftDoubleupWins,
      tft_doubleup_losses: tftDoubleupLosses,
      last_synced_at: new Date().toISOString(),
    })
    .eq('id', memberId)

    if (updateError) {
      console.error(updateError)
      return NextResponse.json(
          { error: 'Failed to update member', details: updateError.message },
          { status: 500 },
      )
    }

    // ====== 6) 최근 5경기 매치 데이터 저장 ======
    // 1) 최근 5개 matchId 가져오기
    const matchIds = await fetchMatchIdsByPuuid(puuid!)

    // (선택) 이 멤버의 최근 5판 승/패를 계산하고 싶으면 여기서 모아둘 수 있음
    const recentResults: ('W' | 'L')[] = []

    for (const matchId of matchIds) {

      // ✅ rate limit 회피용 딜레이
      if (RIOT_MATCH_DETAIL_DELAY_MS > 0) {
        await sleep(RIOT_MATCH_DETAIL_DELAY_MS)
      }

      // 2) 매치 상세 조회
      const match = await fetchMatchById(matchId)

      const { metadata, info } = match

      // 3) tft_matches upsert (이미 있으면 덮어쓰기)
      const matchRow = {
        match_id: metadata.match_id,
        data_version: metadata.data_version ?? null,
        game_datetime: info.game_datetime
            ? new Date(info.game_datetime).toISOString()
            : null,
        queue_id: info.queue_id ?? null,
        tft_set_number: info.tft_set_number ?? null,
        game_length_seconds: info.game_length != null
            ? Math.round(info.game_length) // ✅ 소수 → 정수 초 단위로
            : null,
      }

      const { error: matchUpsertError } = await supabase
      .from('tft_matches')
      .upsert([matchRow] as any, { onConflict: 'match_id' })

      if (matchUpsertError) {
        console.error('tft_matches upsert error', matchUpsertError)
        // 매치 한두 개 실패해도 전체 sync가 죽지 않게 continue
        continue
      }

// ==== 4) 이 멤버의 participant만 저장 ====

      const myPart = info.participants.find((p) => p.puuid === puuid)

      if (!myPart) {
        console.warn(
            `[sync] match ${metadata.match_id} 에 내 puuid(${puuid})가 없음`
        )
        continue // 안전하게 스킵
      }

// 최근 5판 승/패 계산
      const result: 'W' | 'L' = myPart.placement <= 4 ? 'W' : 'L'
      recentResults.push(result)

// 중복 방지 위해 기존 row 삭제
      await supabase
      .from('tft_match_participants')
      .delete()
      .eq('match_id', metadata.match_id)
      .eq('member_id', memberId)

// 내 participant 한 줄만 insert
      const participantRow = {
        match_id: metadata.match_id,
        member_id: memberId,
        puuid: puuid!,
        placement: myPart.placement ?? null,
        level: myPart.level ?? null,
        time_eliminated: myPart.time_eliminated ?? null,
        total_damage_to_players: myPart.total_damage_to_players ?? null,
        augments: myPart.augments ?? null,
        traits: myPart.traits ?? null,
        units: myPart.units ?? null,
        result
      }

      const { error: partInsertError } = await supabase
      .from('tft_match_participants')
      .insert([participantRow] as any)

      if (partInsertError) {
        console.error('tft_match_participants insert error', partInsertError)
      }


    }

    if (recentResults.length > 0) {
      const recent5 = recentResults.slice(0, 5).join(',') // "W,L,W,W,L" 같은 문자열

      const { error: recentUpdateError } = await supabase
      .from('members')
      .update({ tft_recent5: recent5 })
      .eq('id', memberId)

      if (recentUpdateError) {
        console.error('members.tft_recent5 update error', recentUpdateError)
      }
    }

    return NextResponse.json({
      message: 'Sync success',
      memberId,
      puuid,
      rank: {
        solo: {
          tier: tftTier,
          rank: tftRank,
          leaguePoints: tftLeaguePoints,
          wins: tftWins,
          losses: tftLosses,
        },
        doubleUp: {
          tier: tftDoubleupTier,
          rank: tftDoubleupRank,
          leaguePoints: tftDoubleupLeaguePoints,
          wins: tftDoubleupWins,
          losses: tftDoubleupLosses,
        },
      },
    })
  } catch (e: unknown) {
    console.error(e)

    const message =
        e instanceof Error
            ? e.message
            : typeof e === 'string'
                ? e
                : 'Unknown error'

    return NextResponse.json(
        { error: message },
        { status: 500 }
    )
  }
}
