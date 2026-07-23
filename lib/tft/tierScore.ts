// 티어/랭크/LP 를 단조 증가하는 단일 점수로 환산한다.
// 차트(y축)와 랭킹 변동 계산이 공유하므로 컴포넌트가 아닌 lib 에 둔다.

export const TIER_BASE: Record<string, number> = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200,
  PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400,
  MASTER: 2800, GRANDMASTER: 2800, CHALLENGER: 2800,
}

export const RANK_OFFSET: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 }

const APEX_TIERS = ['MASTER', 'GRANDMASTER', 'CHALLENGER']

export function tierScore(tier: string | null, rank: string | null, lp: number | null): number {
  if (!tier || lp === null) return -1
  const t = tier.toUpperCase()
  const base = TIER_BASE[t] ?? 0
  const offset = APEX_TIERS.includes(t) ? 0 : (RANK_OFFSET[rank ?? 'IV'] ?? 0)
  return base + offset + lp
}

export function isApexTier(tier: string | null): boolean {
  return !!tier && APEX_TIERS.includes(tier.toUpperCase())
}
