// app/api/members/[id]/sync/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type {Database} from '@/types/supabase'

// env 가져오기 (서버 전용)
const RIOT_API_KEY = process.env.RIOT_API_KEY
const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const TFT_LEAGUE_BASE_URL = process.env.RIOT_TFT_LEAGUE_BASE_URL


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
