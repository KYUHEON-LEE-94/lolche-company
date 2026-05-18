// lib/riot/api.ts
// Riot TFT Match API 공유 클라이언트

const RIOT_API_KEY = process.env.RIOT_API_KEY
const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const TFT_MATCH_BASE_URL = process.env.RIOT_TFT_MATCH_BASE_URL
const TFT_LEAGUE_BASE_URL = process.env.RIOT_TFT_LEAGUE_BASE_URL

export class RiotApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSec?: number,
  ) {
    super(message)
    this.name = 'RiotApiError'
  }
}

async function riotFetch(url: string): Promise<Response> {
  const res = await fetch(url)
  if (res.ok) return res
  const retryAfterHeader = res.headers.get('Retry-After')
  const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : undefined
  const text = await res.text().catch(() => '')
  throw new RiotApiError(`Riot API error (${res.status}): ${text}`, res.status, retryAfterSec)
}

export type RiotMatchParticipant = {
  puuid: string
  placement: number
  level: number
  time_eliminated: number
  total_damage_to_players: number
  augments?: unknown[]
  traits?: unknown[]
  units?: unknown[]
}

export type RiotMatchResponse = {
  metadata: {
    data_version: string
    match_id: string
    participants: string[]
  }
  info: {
    game_datetime: number
    game_length: number
    queue_id: number
    tft_set_number?: number
    participants: RiotMatchParticipant[]
  }
}

export async function fetchPuuid(gameName: string, tagLine: string): Promise<string> {
  if (!RIOT_API_KEY || !ACCOUNT_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${ACCOUNT_BASE_URL}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?api_key=${RIOT_API_KEY}`
  const res = await riotFetch(url)
  const data = (await res.json()) as { puuid: string }
  return data.puuid
}

export async function fetchMatchIdsByPuuid(puuid: string, count = 5): Promise<string[]> {
  if (!RIOT_API_KEY || !TFT_MATCH_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${TFT_MATCH_BASE_URL}/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${count}&api_key=${RIOT_API_KEY}`
  const res = await riotFetch(url)
  return ((await res.json()) as string[]) ?? []
}

export async function fetchMatchById(matchId: string): Promise<RiotMatchResponse> {
  if (!RIOT_API_KEY || !TFT_MATCH_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${TFT_MATCH_BASE_URL}/matches/${encodeURIComponent(matchId)}?api_key=${RIOT_API_KEY}`
  const res = await riotFetch(url)
  return (await res.json()) as RiotMatchResponse
}

export type TftLeagueEntry = {
  queueType: string
  tier: string
  rank: string
  leaguePoints: number
  wins: number
  losses: number
}

export async function fetchTftLeaguesByPuuid(puuid: string): Promise<TftLeagueEntry[]> {
  if (!RIOT_API_KEY || !TFT_LEAGUE_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${TFT_LEAGUE_BASE_URL}/${encodeURIComponent(puuid)}?api_key=${RIOT_API_KEY}`
  const res = await riotFetch(url)
  return ((await res.json()) as TftLeagueEntry[]) ?? []
}
