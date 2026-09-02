'use client'

type CacheEntry = { expiresAt: number; value: unknown }
type InFlightEntry = { generation: number; promise: Promise<unknown> }

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 100
const responseCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()
const generations = new Map<string, number>()

// ── localStorage 영속 계층 ────────────────────────────────────────────────
// 인메모리 캐시는 새로고침·SPA 이탈에 소실된다. 멤버 상세(matches 등) JSON 은
// units[].imageUrl 을 담고 있어, 이를 영속화하면 재방문/새로고침에도 매치 카드와
// 기물 이미지 URL 이 즉시 그려진다(이미지 바이트는 브라우저 HTTP 캐시가 담당).
// localStorage 접근은 전부 try/catch — 프라이빗 모드·쿼터초과·미지원에서
// 인메모리+네트워크로 무회귀 degrade 한다(lib/theme.ts 와 동일 철학).
//
// DETAIL_CACHE_VERSION: 세트 전환·응답 스키마 변경 시 수동 bump.
// (세트 전환은 재배포를 동반하므로 배포에 실린 상수 bump 가 자연스러운 무효화 지점이다.)
const DETAIL_CACHE_VERSION = '1'
const PERSIST_TTL_MS = 10 * 60 * 1000
const PERSIST_ROOT = 'mdc:'
const PERSIST_PREFIX = `${PERSIST_ROOT}${DETAIL_CACHE_VERSION}:`

type PersistEnvelope = { e: number; v: unknown }

function persistStore(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage
  } catch {
    return null
  }
}

/** `mdc:` 네임스페이스(버전 불문) 전체 제거 — 버전 불일치·쿼터 초과 정리 겸용. */
function purgeNamespace(store: Storage): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      if (key && key.startsWith(PERSIST_ROOT)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  } catch {
    /* 접근 불가 — 무시 */
  }
}

function readPersisted(url: string): unknown | null {
  const store = persistStore()
  if (!store) return null
  try {
    const raw = store.getItem(PERSIST_PREFIX + url)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PersistEnvelope
    if (typeof parsed?.e !== 'number' || parsed.e <= Date.now()) {
      store.removeItem(PERSIST_PREFIX + url)
      return null
    }
    return parsed.v
  } catch {
    return null
  }
}

function writePersisted(url: string, value: unknown): void {
  const store = persistStore()
  if (!store) return
  const payload = JSON.stringify({ e: Date.now() + PERSIST_TTL_MS, v: value } satisfies PersistEnvelope)
  try {
    store.setItem(PERSIST_PREFIX + url, payload)
  } catch {
    // 쿼터 초과 등 — 네임스페이스를 비우고 1회 재시도. 그래도 실패하면 조용히 skip.
    purgeNamespace(store)
    try {
      store.setItem(PERSIST_PREFIX + url, payload)
    } catch {
      /* degrade: 인메모리+네트워크로만 동작 */
    }
  }
}

function currentGeneration(url: string): number {
  return generations.get(url) ?? 0
}

function pruneCache(now: number): void {
  for (const [url, entry] of responseCache) {
    if (entry.expiresAt <= now) responseCache.delete(url)
  }
  while (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestUrl = responseCache.keys().next().value as string | undefined
    if (!oldestUrl) break
    responseCache.delete(oldestUrl)
  }
}

export async function cachedJson<T>(url: string, opts?: { persist?: boolean }): Promise<T> {
  const persist = opts?.persist ?? false
  const generation = currentGeneration(url)
  const cached = responseCache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    responseCache.delete(url)
    responseCache.set(url, cached)
    return cached.value as T
  }
  if (cached) responseCache.delete(url)

  // 메모리 미스 시 localStorage 를 확인해 즉시 반환(+메모리 승격). 새로고침/재방문 즉시 표시.
  if (persist) {
    const persisted = readPersisted(url)
    if (persisted !== null) {
      pruneCache(Date.now())
      responseCache.set(url, { value: persisted, expiresAt: Date.now() + CACHE_TTL_MS })
      return persisted as T
    }
  }

  const pending = inFlight.get(url)
  if (pending && pending.generation === generation) return pending.promise as Promise<T>

  const request = fetch(url)
    .then(async (response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const value = (await response.json()) as T
      if (currentGeneration(url) !== generation) {
        throw new Error('캐시 무효화로 취소된 요청입니다.')
      }
      pruneCache(Date.now())
      responseCache.set(url, { value, expiresAt: Date.now() + CACHE_TTL_MS })
      if (persist) writePersisted(url, value)
      return value
    })
    .finally(() => {
      if (inFlight.get(url)?.promise === request) inFlight.delete(url)
    })

  inFlight.set(url, { generation, promise: request })
  return request
}

export function invalidateMemberDetailCache(memberId: string): void {
  const prefix = `/api/members/${memberId}/`
  const urls = new Set([...responseCache.keys(), ...inFlight.keys()])
  for (const url of urls) {
    if (!url.startsWith(prefix)) continue
    responseCache.delete(url)
    inFlight.delete(url)
    generations.set(url, currentGeneration(url) + 1)
  }

  // 영속 계층도 함께 무효화 — 수동 동기화 후 stale 매치가 새로고침에 남지 않도록.
  const store = persistStore()
  if (!store) return
  try {
    const persistedPrefix = `${PERSIST_PREFIX}${prefix}`
    const keys: string[] = []
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i)
      if (key && key.startsWith(persistedPrefix)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  } catch {
    /* 접근 불가 — 무시 */
  }
}
