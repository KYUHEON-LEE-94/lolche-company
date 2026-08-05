'use client'

type CacheEntry = { expiresAt: number; value: unknown }
type InFlightEntry = { generation: number; promise: Promise<unknown> }

const CACHE_TTL_MS = 5 * 60 * 1000
const MAX_CACHE_ENTRIES = 100
const responseCache = new Map<string, CacheEntry>()
const inFlight = new Map<string, InFlightEntry>()
const generations = new Map<string, number>()

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

export async function cachedJson<T>(url: string): Promise<T> {
  const generation = currentGeneration(url)
  const cached = responseCache.get(url)
  if (cached && cached.expiresAt > Date.now()) {
    responseCache.delete(url)
    responseCache.set(url, cached)
    return cached.value as T
  }
  if (cached) responseCache.delete(url)

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
}
