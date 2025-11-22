// app/api/members/[id]/sync/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type {Database} from '@/types/supabase'

// env 가져오기 (서버 전용)
const RIOT_API_KEY = process.env.RIOT_API_KEY
const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const TFT_SUMMONER_BASE_URL = process.env.RIOT_TFT_SUMMONER_BASE_URL
const TFT_LEAGUE_BASE_URL = process.env.RIOT_TFT_LEAGUE_BASE_URL


if (!RIOT_API_KEY || !ACCOUNT_BASE_URL || !TFT_SUMMONER_BASE_URL || !TFT_LEAGUE_BASE_URL) {
  throw new Error('Riot API env variables are not set')
}

// Riot ID → PUUID
async function fetchPuuid(gameName: string, tagLine: string): Promise<string> {
  const url = `${ACCOUNT_BASE_URL}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName,
  )}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`
  console.log("RIOT_url:", url)
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

async function fetchTftRankBySummonerId(
    summonerId: string,
): Promise<TftLeagueEntry | null> {
  const url = `${TFT_LEAGUE_BASE_URL}/tft/league/v1/by-puuid/${encodeURIComponent(
      summonerId,
  )}?api_key=${RIOT_API_KEY}`

  const res = await fetch(url, { method: 'GET' })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TFT League API error (${res.status}): ${text}`)
  }

  const data = (await res.json()) as TftLeagueEntry[]

  if (!data || data.length === 0) {
    return null
  }

  // 여러 큐 타입이 있을 수 있지만, 보통 RANKED_TFT 같은 큐 타입을 우선
  const ranked = data.find((e) => e.queueType === 'RANKED_TFT') ?? data[0]
  return ranked
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

    // 3) summonerId → TFT 리그(랭크) 정보
    const rankEntry = await fetchTftRankBySummonerId(puuid!)
    let tftTier: string | null = null
    let tftRank: string | null = null
    let tftLeaguePoints: number | null = null
    let tftWins: number | null = null
    let tftLosses: number | null = null

    if (rankEntry) {
      tftTier = rankEntry.tier
      tftRank = rankEntry.rank
      tftLeaguePoints = rankEntry.leaguePoints
      tftWins = rankEntry.wins
      tftLosses = rankEntry.losses
    }

    // 5) Supabase 업데이트
    const { error: updateError } = await supabase
    .from('members') // 🔴 <Member> 절대 넣지 말기
    .update({
      riot_puuid: puuid ?? null,
      tft_tier: tftTier,
      tft_rank: tftRank,
      tft_league_points: tftLeaguePoints,
      tft_wins: tftWins,
      tft_losses: tftLosses,
      last_synced_at: new Date().toISOString(),
    } satisfies Database['public']['Tables']['members']['Update']) // ✅ 타입 맞추기
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
        tier: tftTier,
        rank: tftRank,
        leaguePoints: tftLeaguePoints,
        wins: tftWins,
        losses: tftLosses,
      },
    })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json(
        { error: e?.message ?? String(e) },
        { status: 500 },
    )
  }
}
