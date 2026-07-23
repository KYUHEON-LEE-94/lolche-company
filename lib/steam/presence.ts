// 스팀 "지금 게임 중" 조회.
//
// ⚠ STEAM_API_KEY 를 쓰는 외부 호출이다. 'server-only' 체인(presence → api)을 유지한다.
// ⚠ DB 에 저장하지 않는다. presence 는 휘발성이라 컬럼을 만들면 크론이 하루 지난
//   "온라인" 을 박제하게 된다.
//
// 캐시는 모듈 스코프 단일 엔트리다. 대상이 "approved + steam_id64 있는 전 멤버" 하나뿐이라
// 키를 둘 이유가 없고, 뷰어가 몇 명이든 Steam 호출은 TTL 당 1회로 고정된다.
import 'server-only'
import { fetchPlayerSummaries, type SteamPlayerSummary } from './api'

const CACHE_TTL_MS = Number(process.env.STEAM_PRESENCE_TTL_MS ?? 60_000)

const STEAM_VISIBILITY_PUBLIC = 3

export type SteamPresenceInfo = {
  /** 0=오프라인, 1~6=온라인 계열 */
  personastate: number
  /** 3 이면 공개 */
  communityvisibilitystate: number
  gameName: string | null
}

type CacheEntry = { at: number; map: Map<string, SteamPresenceInfo> }
let cache: CacheEntry | null = null

/** 진행 중인 요청을 공유해 동시 요청이 Steam 을 중복 호출하지 않게 한다. */
let inflight: Promise<Map<string, SteamPresenceInfo>> | null = null

function toInfo(summary: SteamPlayerSummary): SteamPresenceInfo {
  return {
    personastate: summary.personastate,
    communityvisibilitystate: summary.communityvisibilitystate,
    gameName: summary.gameextrainfo,
  }
}

function isFresh(entry: CacheEntry, steamIds: string[]): boolean {
  if (Date.now() - entry.at > CACHE_TTL_MS) return false
  // 새로 스팀을 연결한 멤버가 TTL 동안 누락되지 않도록 미포함 id 가 있으면 갱신한다.
  return steamIds.every((id) => entry.map.has(id))
}

/**
 * SteamID64 → presence 맵. TTL 내 재호출은 캐시를 그대로 돌려준다.
 * 비공개 프로필은 Steam 이 personastate=0 으로만 답하므로 "오프라인"과 구분하려면
 * 호출자가 communityvisibilitystate 를 함께 봐야 한다 (isPresenceVisible 참고).
 */
export async function fetchPresenceMap(
  steamIds: string[],
): Promise<Map<string, SteamPresenceInfo>> {
  if (steamIds.length === 0) return new Map()

  if (cache && isFresh(cache, steamIds)) return cache.map
  if (inflight) return inflight

  inflight = (async () => {
    const summaries = await fetchPlayerSummaries(steamIds)
    const map = new Map<string, SteamPresenceInfo>()
    for (const s of summaries) map.set(s.steamid, toInfo(s))
    // 응답에 없는 id(삭제/비공개 계정)도 캐시에 넣어야 isFresh 가 매번 무효화되지 않는다.
    for (const id of steamIds) {
      if (!map.has(id)) {
        map.set(id, { personastate: 0, communityvisibilitystate: 0, gameName: null })
      }
    }
    cache = { at: Date.now(), map }
    return map
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

/** 프로필이 비공개면 personastate 는 항상 0 이다. 이를 "오프라인"으로 단정하면 오정보다. */
export function isPresenceVisible(
  info: SteamPresenceInfo | undefined,
  dbVisibility: number | null,
): boolean {
  if (!info) return false
  if (dbVisibility != null && dbVisibility !== STEAM_VISIBILITY_PUBLIC) return false
  return info.communityvisibilitystate === STEAM_VISIBILITY_PUBLIC
}
