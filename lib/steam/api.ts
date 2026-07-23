// lib/steam/api.ts
// Steam Web API 공유 클라이언트.
// ⚠ STEAM_API_KEY 는 서버 전용이다. 'server-only' 로 클라이언트 번들 유입을 컴파일 타임에 막는다.
import 'server-only'

const STEAM_API_KEY = process.env.STEAM_API_KEY
const STEAM_API_BASE = 'https://api.steampowered.com'

export class SteamApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message)
    this.name = 'SteamApiError'
  }
}

/**
 * Steam Web API 는 키를 쿼리 파라미터로만 받는다(헤더 인증 미지원).
 * 그래서 URL 자체를 에러 메시지·로그에 절대 싣지 않는다 — 키가 로그로 새는 것을 막기 위함.
 */
async function steamFetch(path: string, params: Record<string, string>): Promise<unknown> {
  if (!STEAM_API_KEY) {
    throw new SteamApiError('STEAM_API_KEY 환경 변수가 설정되지 않았습니다', 500)
  }
  const url = new URL(`${STEAM_API_BASE}${path}`)
  url.searchParams.set('key', STEAM_API_KEY)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const res = await fetch(url.toString(), { cache: 'no-store' })
  if (!res.ok) {
    throw new SteamApiError(`Steam API 오류 (${res.status}) at ${path}`, res.status)
  }
  return res.json()
}

export type SteamPlayerSummary = {
  steamid: string
  personaname: string
  avatarfull: string
  /** 3 = 공개. 그 외는 비공개(친구 공개 포함) */
  communityvisibilitystate: number
  profileurl: string | null
}

type PlayerSummariesResponse = {
  response?: {
    players?: Array<{
      steamid?: unknown
      personaname?: unknown
      avatarfull?: unknown
      communityvisibilitystate?: unknown
      profileurl?: unknown
    }>
  }
}

const asString = (v: unknown) => (typeof v === 'string' ? v : '')
const asNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** GetPlayerSummaries 는 1회 호출당 최대 100개의 SteamID64 를 받는다. */
export async function fetchPlayerSummaries(steamIds: string[]): Promise<SteamPlayerSummary[]> {
  if (steamIds.length === 0) return []

  const out: SteamPlayerSummary[] = []
  for (const group of chunk(steamIds, 100)) {
    const json = (await steamFetch('/ISteamUser/GetPlayerSummaries/v2/', {
      steamids: group.join(','),
    })) as PlayerSummariesResponse

    for (const p of json.response?.players ?? []) {
      const steamid = asString(p.steamid)
      if (!steamid) continue
      out.push({
        steamid,
        personaname: asString(p.personaname),
        avatarfull: asString(p.avatarfull),
        communityvisibilitystate: asNumber(p.communityvisibilitystate),
        profileurl: asString(p.profileurl) || null,
      })
    }
  }
  return out
}

export type SteamOwnedGameRaw = {
  appid: number
  name: string | null
  /** 분 단위 */
  playtime_forever: number
  /** 분 단위 (최근 2주) */
  playtime_2weeks: number
}

type OwnedGamesResponse = {
  response?: {
    game_count?: unknown
    games?: Array<{
      appid?: unknown
      name?: unknown
      playtime_forever?: unknown
      playtime_2weeks?: unknown
    }>
  }
}

/**
 * 보유 게임 조회.
 * 프로필/게임 상세정보가 비공개면 Steam 은 `{"response":{}}` 를 200 으로 돌려준다.
 * 에러와 구분해야 하므로 이 경우 null 을 반환한다.
 */
export async function fetchOwnedGames(steamId64: string): Promise<SteamOwnedGameRaw[] | null> {
  const json = (await steamFetch('/IPlayerService/GetOwnedGames/v1/', {
    steamid: steamId64,
    include_appinfo: '1',
    include_played_free_games: '1',
    format: 'json',
  })) as OwnedGamesResponse

  const games = json.response?.games
  if (!Array.isArray(games)) return null

  const out: SteamOwnedGameRaw[] = []
  for (const g of games) {
    const appid = asNumber(g.appid)
    if (!appid) continue
    out.push({
      appid,
      name: asString(g.name) || null,
      playtime_forever: asNumber(g.playtime_forever),
      playtime_2weeks: asNumber(g.playtime_2weeks),
    })
  }
  return out
}

type ResolveVanityResponse = {
  response?: { success?: unknown; steamid?: unknown }
}

/** vanity URL → SteamID64. 존재하지 않으면 null. */
export async function resolveVanityUrl(vanity: string): Promise<string | null> {
  const json = (await steamFetch('/ISteamUser/ResolveVanityURL/v1/', {
    vanityurl: vanity,
  })) as ResolveVanityResponse

  if (asNumber(json.response?.success) !== 1) return null
  const steamid = asString(json.response?.steamid)
  return /^\d{17}$/.test(steamid) ? steamid : null
}
