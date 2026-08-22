export type SteamFeaturedDeal = {
  appid: number
  name: string
  discountPercent: number
  originalPrice: number
  finalPrice: number
  imageUrl: string | null
  expiresAt: number | null
}

type RawDeal = Record<string, unknown>

export function isSteamFeaturedDeal(value: unknown): value is SteamFeaturedDeal {
  if (!value || typeof value !== 'object') return false
  const deal = value as RawDeal
  return typeof deal.appid === 'number' && Number.isInteger(deal.appid) && deal.appid > 0
    && typeof deal.name === 'string' && deal.name.trim().length > 0
    && typeof deal.discountPercent === 'number' && Number.isInteger(deal.discountPercent) && deal.discountPercent >= 1 && deal.discountPercent <= 100
    && typeof deal.originalPrice === 'number' && Number.isInteger(deal.originalPrice) && deal.originalPrice >= 0
    && typeof deal.finalPrice === 'number' && Number.isInteger(deal.finalPrice) && deal.finalPrice >= 0
    && (typeof deal.imageUrl === 'string' || deal.imageUrl === null)
    && (typeof deal.expiresAt === 'number' || deal.expiresAt === null)
}

export function formatSteamMoney(minorUnit: number) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'currency', currency: 'KRW', maximumFractionDigits: 0,
  }).format(minorUnit / 100)
}

export function formatSteamDealDeadline(seconds: number | null) {
  if (!seconds) return null
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
  }).format(new Date(seconds * 1000))
}
