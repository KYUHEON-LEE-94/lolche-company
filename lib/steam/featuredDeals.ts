import 'server-only'

import type { SteamFeaturedDeal } from '@/lib/steam/featuredDealsShared'

export type { SteamFeaturedDeal } from '@/lib/steam/featuredDealsShared'

const ENDPOINT = 'https://store.steampowered.com/api/featuredcategories?cc=kr&l=koreana'
const KRW = 'KRW'

type RawItem = Record<string, unknown>

function asItems(value: unknown): RawItem[] {
  if (!value || typeof value !== 'object') return []
  const items = (value as Record<string, unknown>).items
  return Array.isArray(items) ? items.filter((item): item is RawItem => Boolean(item) && typeof item === 'object') : []
}

function safeImage(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || (!url.hostname.endsWith('.steamstatic.com') && url.hostname !== 'steamstatic.com')) return null
    return url.toString()
  } catch { return null }
}

function parseDeal(raw: RawItem, nowSeconds: number): SteamFeaturedDeal | null {
  const appid = raw.id
  const name = raw.name
  const discountPercent = raw.discount_percent
  const originalPrice = raw.original_price
  const finalPrice = raw.final_price
  const expiration = raw.discount_expiration
  if (typeof appid !== 'number' || !Number.isInteger(appid) || appid <= 0 || typeof name !== 'string' || !name.trim() || raw.discounted !== true || typeof discountPercent !== 'number' || !Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 100 || raw.currency !== KRW || typeof originalPrice !== 'number' || !Number.isInteger(originalPrice) || originalPrice < 0 || typeof finalPrice !== 'number' || !Number.isInteger(finalPrice) || finalPrice < 0) return null
  const expiresAt = typeof expiration === 'number' && Number.isFinite(expiration) ? expiration : null
  if (expiresAt !== null && expiresAt <= nowSeconds) return null
  return { appid, name: name.trim(), discountPercent, originalPrice, finalPrice, imageUrl: safeImage(raw.header_image), expiresAt }
}

export async function fetchSteamFeaturedDeals(): Promise<SteamFeaturedDeal[] | null> {
  try {
    const response = await fetch(ENDPOINT, { signal: AbortSignal.timeout(4000), next: { revalidate: 300 } })
    if (!response.ok) return null
    const payload: unknown = await response.json()
    if (!payload || typeof payload !== 'object') return null
    const root = payload as Record<string, unknown>
    const nowSeconds = Math.floor(Date.now() / 1000)
    const unique = new Map<number, SteamFeaturedDeal>()
    for (const raw of [...asItems(root.specials), ...asItems(root.cat_dailydeal)]) {
      const deal = parseDeal(raw, nowSeconds)
      if (deal && !unique.has(deal.appid)) unique.set(deal.appid, deal)
    }
    return [...unique.values()].sort((a, b) => b.discountPercent - a.discountPercent || a.finalPrice - b.finalPrice).slice(0, 10)
  } catch { return null }
}
