// lib/riot/api.ts
// Riot TFT Match API 공유 클라이언트

const RIOT_API_KEY = process.env.RIOT_API_KEY
const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const TFT_MATCH_BASE_URL = process.env.RIOT_TFT_MATCH_BASE_URL
const TFT_LEAGUE_BASE_URL = process.env.RIOT_TFT_LEAGUE_BASE_URL
const LOL_LEAGUE_BASE_URL = process.env.RIOT_LOL_LEAGUE_BASE_URL

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
  if (!RIOT_API_KEY) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const res = await fetch(url, { headers: { 'X-Riot-Token': RIOT_API_KEY } })
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
  if (!ACCOUNT_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${ACCOUNT_BASE_URL}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  const res = await riotFetch(url)
  const data = (await res.json()) as { puuid: string }
  return data.puuid
}

export async function fetchMatchIdsByPuuid(puuid: string, count = 5): Promise<string[]> {
  if (!TFT_MATCH_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${TFT_MATCH_BASE_URL}/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${count}`
  const res = await riotFetch(url)
  return ((await res.json()) as string[]) ?? []
}

export async function fetchMatchById(matchId: string): Promise<RiotMatchResponse> {
  if (!TFT_MATCH_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${TFT_MATCH_BASE_URL}/matches/${encodeURIComponent(matchId)}`
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
  if (!TFT_LEAGUE_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${TFT_LEAGUE_BASE_URL}/${encodeURIComponent(puuid)}`
  const res = await riotFetch(url)
  return ((await res.json()) as TftLeagueEntry[]) ?? []
}

/** LoL 리그 엔트리. 응답 형태가 TFT 와 동일해 타입을 공유한다. */
export type LolLeagueEntry = TftLeagueEntry

export const LOL_SOLO_QUEUE = 'RANKED_SOLO_5x5'

let lolForbiddenWarned = false

/**
 * LoL 솔로랭크 엔트리 조회.
 *
 * 프로덕션 키의 제품 권한이 LoL 로 승인되지 않으면 403 이 반환된다.
 * 이 경우 재시도해봐야 낭비이고 TFT 동기화까지 깨뜨리므로,
 * 경고를 한 번만 남기고 degrade 한다.
 *
 * 반환값: `null` = 조회 불가(권한 미승인) — 기존 저장값을 유지해야 한다.
 *         `[]`   = 조회 성공했으나 언랭.
 */
export async function fetchLolLeaguesByPuuid(puuid: string): Promise<LolLeagueEntry[] | null> {
  if (!LOL_LEAGUE_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${LOL_LEAGUE_BASE_URL}/${encodeURIComponent(puuid)}`
  try {
    const res = await riotFetch(url)
    return ((await res.json()) as LolLeagueEntry[]) ?? []
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 403) {
      if (!lolForbiddenWarned) {
        lolForbiddenWarned = true
        console.warn('[riot] LoL API 403 — 프로덕션 키에 LoL 제품 권한이 없습니다. LoL 랭크 수집을 건너뜁니다.')
      }
      return null
    }
    throw e
  }
}
