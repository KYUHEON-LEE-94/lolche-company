// 스팀 스토어 전체 카탈로그 검색.
//
// ⚠ store.steampowered.com/api/storesearch 는 비공식(문서화되지 않은) 엔드포인트다.
//   - API 키를 요구하지 않는다 (lib/steam/api.ts 의 steamFetch 를 쓰지 않는다)
//   - 사용자 입력 경로이므로 appDetails.ts 와 달리 **타임아웃을 반드시 건다**
//   - 실패는 null 로 두고 호출자가 "수동 입력 폴백"으로 degrade 한다
import 'server-only'

const TIMEOUT_MS = Number(process.env.STEAM_STORE_TIMEOUT_MS ?? 4000)
const CACHE_TTL_MS = Number(process.env.STEAM_CATALOG_CACHE_TTL_MS ?? 600_000)
const CACHE_MAX = 300
const RESULT_LIMIT = 20
const TERM_MAX = 50

export const CATALOG_QUERY_MIN = 2

export type CatalogItem = { appid: number; name: string }

type Entry = { at: number; items: CatalogItem[] }
const cache = new Map<string, Entry>()

function readCache(key: string): CatalogItem[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  // LRU: 재삽입으로 최신화
  cache.delete(key)
  cache.set(key, hit)
  return hit.items
}

function writeCache(key: string, items: CatalogItem[]) {
  cache.set(key, { at: Date.now(), items })
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

type RawItem = { id?: unknown; name?: unknown; type?: unknown }

/** 실패(타임아웃/5xx/파싱 오류) 시 null. 호출자는 200 + 빈 목록으로 degrade 한다. */
export async function searchStoreCatalog(termRaw: string): Promise<CatalogItem[] | null> {
  const term = termRaw.trim().slice(0, TERM_MAX)
  if (term.length < CATALOG_QUERY_MIN) return []

  const key = term.toLowerCase()
  const cached = readCache(key)
  if (cached) return cached

  try {
    const url = new URL('https://store.steampowered.com/api/storesearch/')
    url.searchParams.set('term', term)
    url.searchParams.set('l', 'korean')
    url.searchParams.set('cc', 'kr')

    const res = await fetch(url.toString(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) return null

    const json = (await res.json()) as { items?: RawItem[] }
    if (!Array.isArray(json.items)) return null

    const items: CatalogItem[] = []
    for (const raw of json.items) {
      // 사운드트랙/영상 등은 type 이 'app' 이 아니다. 값이 없으면 통과시킨다(스펙 변동 대비).
      if (typeof raw.type === 'string' && raw.type !== 'app') continue
      const appid = typeof raw.id === 'number' ? raw.id : Number(raw.id)
      const name = typeof raw.name === 'string' ? raw.name.trim() : ''
      if (!Number.isInteger(appid) || appid <= 0 || !name) continue
      items.push({ appid, name })
      if (items.length >= RESULT_LIMIT) break
    }

    writeCache(key, items)
    return items
  } catch {
    // 타임아웃(AbortError) 포함. 로그에 URL 을 싣지 않는다(lib/steam 관행).
    return null
  }
}
