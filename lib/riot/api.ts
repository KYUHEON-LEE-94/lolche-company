// lib/riot/api.ts
// Riot TFT Match API 공유 클라이언트

const ACCOUNT_BASE_URL = process.env.RIOT_ACCOUNT_BASE_URL
const TFT_MATCH_BASE_URL = process.env.RIOT_TFT_MATCH_BASE_URL
const TFT_LEAGUE_BASE_URL = process.env.RIOT_TFT_LEAGUE_BASE_URL
const LOL_LEAGUE_BASE_URL = process.env.RIOT_LOL_LEAGUE_BASE_URL

/**
 * Riot 앱(=API 키)은 제품 단위로 분리된다. TFT 키와 LoL 키는 서로 다른 앱이며,
 * ★ PUUID 는 키에 종속된 암호문이라 키를 섞어 쓰면 400 이 반환된다.
 * account-v1 은 "공통 엔드포인트"지만 어떤 키로 부르느냐에 따라 결과 puuid 가 다르다.
 */
export type RiotProduct = 'tft' | 'lol'

/**
 * top-level 상수로 캡처하지 않는 이유: 서버리스 인스턴스가 살아 있는 동안
 * env 가 갱신되어도 옛 값을 계속 쓰게 된다.
 */
function apiKeyFor(product: RiotProduct): string | undefined {
  return product === 'lol' ? process.env.RIOT_LOL_API_KEY : process.env.RIOT_API_KEY
}

const warnedKeys = new Set<string>()

/** 동일 사유의 경고를 프로세스당 1회만 남긴다(멤버 수만큼 로그가 오염되는 것 방지). */
function warnOnce(key: string, message: string) {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.warn(message)
}

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

async function riotFetch(url: string, product: RiotProduct = 'tft'): Promise<Response> {
  const apiKey = apiKeyFor(product)
  if (!apiKey) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  // 키 값은 헤더로만 전송한다. URL·에러 메시지·로그에 절대 싣지 않는다.
  const res = await fetch(url, { headers: { 'X-Riot-Token': apiKey } })
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

/**
 * account-v1 로 PUUID 를 발급받는다.
 * ★ 반환값은 `product` 키에 종속된다. 기본값 'tft' 는 riot_puuid(내전 매치 매칭에 사용)용이다.
 */
export async function fetchPuuid(
  gameName: string,
  tagLine: string,
  product: RiotProduct = 'tft',
): Promise<string> {
  if (!ACCOUNT_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = `${ACCOUNT_BASE_URL}/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`
  const res = await riotFetch(url, product)
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

/** LoL 키가 없으면 LoL 단계 전체를 조용히 건너뛴다(throw 하면 멤버 수만큼 로그가 오염된다). */
function hasLolKey(): boolean {
  if (process.env.RIOT_LOL_API_KEY) return true
  warnOnce('lol-key-missing', '[riot] RIOT_LOL_API_KEY 미설정 — LoL 랭크 수집을 건너뜁니다.')
  return false
}

/**
 * LoL 전용 키로 PUUID 를 발급받는다. TFT 키로 받은 riot_puuid 와는 값이 다르다.
 *
 * 반환값: `null` = 발급 불가(키 없음 / 403) — 호출자는 LoL 단계를 건너뛴다.
 */
export async function fetchLolPuuid(gameName: string, tagLine: string): Promise<string | null> {
  if (!hasLolKey()) return null
  try {
    return await fetchPuuid(gameName, tagLine, 'lol')
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 403) {
      warnOnce(
        'lol-account-403',
        '[riot] LoL account API 403 — RIOT_LOL_API_KEY 가 만료되었거나 권한이 없습니다. LoL 랭크 수집을 건너뜁니다.',
      )
      return null
    }
    throw e
  }
}

/**
 * LoL 솔로랭크 엔트리 조회. **반드시 LoL 키로 발급받은 puuid 를 넘겨야 한다.**
 * TFT puuid 를 넘기면 400(Exception decrypting)이 반환된다.
 *
 * 반환값: `null` = 조회 불가(키 없음 / 권한 미승인) — 기존 저장값을 유지해야 한다.
 *         `[]`   = 조회 성공했으나 언랭.
 * 400 은 그대로 throw 한다 — puuid 재발급 여부는 호출자가 판단한다.
 */
export async function fetchLolLeaguesByPuuid(puuid: string): Promise<LolLeagueEntry[] | null> {
  if (!LOL_LEAGUE_BASE_URL) {
    throw new RiotApiError('Riot API 환경 변수가 설정되지 않았습니다', 500)
  }
  if (!hasLolKey()) return null
  const url = `${LOL_LEAGUE_BASE_URL}/${encodeURIComponent(puuid)}`
  try {
    const res = await riotFetch(url, 'lol')
    return ((await res.json()) as LolLeagueEntry[]) ?? []
  } catch (e) {
    if (e instanceof RiotApiError && e.status === 403) {
      warnOnce(
        'lol-league-403',
        '[riot] LoL API 403 — RIOT_LOL_API_KEY 에 LoL 제품 권한이 없거나 만료되었습니다. LoL 랭크 수집을 건너뜁니다.',
      )
      return null
    }
    throw e
  }
}

/** 400 재발급 2회 실패처럼 "이번 주기는 포기" 상황을 1회만 경고할 때 호출자가 쓴다. */
export function warnRiotOnce(key: string, message: string) {
  warnOnce(key, message)
}
