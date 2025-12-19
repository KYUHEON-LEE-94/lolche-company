// lib/riot/doSyncMember.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { Database } from '@/types/supabase'
import { SyncError } from '@/lib/sync/syncMember'

// env
const RIOT_API_KEY = process.env.RIOT_API_KEY
const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const TFT_LEAGUE_BASE_URL = process.env.RIOT_TFT_LEAGUE_BASE_URL
const TFT_MATCH_BASE_URL = process.env.RIOT_TFT_MATCH_BASE_URL

const RIOT_MATCH_DETAIL_DELAY_MS = Number(process.env.RIOT_MATCH_DETAIL_DELAY_MS ?? '1200')

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (!RIOT_API_KEY || !ACCOUNT_BASE_URL || !TFT_LEAGUE_BASE_URL || !TFT_MATCH_BASE_URL) {
  throw new Error('Riot API env variables are not set')
}

async function riotFetchOrThrow(url: string) {
  const res = await fetch(url, { method: 'GET' })
  if (res.ok) return res

  const retryAfterHeader = res.headers.get('Retry-After')
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined
  const text = await res.text().catch(() => '')

  throw new SyncError(`Riot API error (${res.status}): ${text}`, res.status, retryAfterSec)
}

// Riot ID → PUUID
async function fetchPuuid(gameName: string, tagLine: string): Promise<string> {
  const url = `${ACCOUNT_BASE_URL}/${encodeURIComponent(gameName)}/${encodeURIComponent(
      tagLine,
  )}?api_key=${RIOT_API_KEY}`

  const res = await riotFetchOrThrow(url)
  const data = await res.json()
  return data.puuid as string
}

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
  game_datetime: number
  game_length: number
  queue_id: number
  tft_set_number?: number
  participants: RiotMatchParticipant[]
}

type RiotMatchResponse = {
  metadata: RiotMatchMetadata
  info: RiotMatchInfo
}

async function fetchTftLeaguesByPuuid(puuid: string): Promise<TftLeagueEntry[]> {
  const url = `${TFT_LEAGUE_BASE_URL}/${encodeURIComponent(puuid)}?api_key=${RIOT_API_KEY}`
  const res = await riotFetchOrThrow(url)
  const data = (await res.json()) as TftLeagueEntry[]
  return data ?? []
}

async function fetchMatchIdsByPuuid(puuid: string, count = 5): Promise<string[]> {
  const url = `${TFT_MATCH_BASE_URL}/matches/by-puuid/${encodeURIComponent(
      puuid,
  )}/ids?start=0&count=${count}&api_key=${RIOT_API_KEY}`

  const res = await riotFetchOrThrow(url)
  const data = (await res.json()) as string[]
  return data ?? []
}

async function fetchMatchById(matchId: string): Promise<RiotMatchResponse> {
  const url = `${TFT_MATCH_BASE_URL}/matches/${encodeURIComponent(matchId)}?api_key=${RIOT_API_KEY}`
  const res = await riotFetchOrThrow(url)
  return (await res.json()) as RiotMatchResponse
}

// ✅ 공용 doSync
export async function doSyncMember(memberId: string) {
  const { data: memberData, error: memberError } = await supabaseAdmin
  .from('members')
  .select('*')
  .eq('id', memberId)
  .single()

  if (memberError || !memberData) {
    throw new SyncError('Member not found', 404)
  }

  const member = memberData as Database['public']['Tables']['members']['Row']

  // 최근 동기화 제한(10분)
  if (member.last_synced_at) {
    const last = new Date(member.last_synced_at).getTime()
    const now = Date.now()
    const diffMs = now - last
    const diffMinutes = diffMs / 1000 / 60
    if (diffMinutes < 10) {
      const remainSec = Math.ceil((10 * 60 * 1000 - diffMs) / 1000)
      throw new SyncError(`최근에 이미 동기화되었습니다. (${diffMinutes.toFixed(2)}m)`, 429, remainSec)
    }
  }

  // PUUID
  let puuid = member.riot_puuid
  if (!puuid) {
    puuid = await fetchPuuid(member.riot_game_name, member.riot_tagline)
  }

  // League
  const leagues = await fetchTftLeaguesByPuuid(puuid!)
  const solo = leagues.find((e) => e.queueType === 'RANKED_TFT') ?? null
  const doubleUp = leagues.find((e) => e.queueType === 'RANKED_TFT_DOUBLE_UP') ?? null

  const { data: updatedRows, error: updateError } = await supabaseAdmin
  .from('members')
  .update({
    riot_puuid: puuid ?? null,
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
  })
  .eq('id', memberId)
  .select('id')

  if (updateError) throw new SyncError(updateError.message, 500)
  if (!updatedRows || updatedRows.length === 0) {
    throw new SyncError('Update affected 0 rows. (RLS blocked or wrong id?)', 403)
  }

  // Matches (recent 5)
  const matchIds = await fetchMatchIdsByPuuid(puuid!)
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
    }

    const { error: partInsertError } = await supabaseAdmin
    .from('tft_match_participants')
    .insert([participantRow])

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
