// CLAUDE.md 기준: 낮을수록 높은 랭크 (CHALLENGER=1, IRON=10)
export const TIER_ORDER: Record<string, number> = {
  CHALLENGER: 1, GRANDMASTER: 2, MASTER: 3,
  DIAMOND: 4, EMERALD: 5, PLATINUM: 6,
  GOLD: 7, SILVER: 8, BRONZE: 9, IRON: 10,
}

// 낮을수록 높은 랭크 (I=1, IV=4)
export const RANK_ORDER: Record<string, number> = {
  I: 1, II: 2, III: 3, IV: 4,
}

export function rankOrder(rank: string | null | undefined): number {
  return rank ? (RANK_ORDER[rank] ?? 999) : 999
}

export function tierOrder(tier: string | null | undefined): number {
  return tier ? (TIER_ORDER[tier] ?? 999) : 999
}

/** 티어/랭크/LP 를 가진 값. TFT·LoL 모두 티어 10종 + 디비전 I~IV 로 동일하다. */
export type RankLike = {
  tier: string | null | undefined
  rank: string | null | undefined
  lp: number | null | undefined
}

/**
 * 랭킹 정렬 비교자. 티어 → 랭크 → LP 내림차순.
 * 값이 없거나 알 수 없는 티어/랭크는 999 로 취급되어 최하단으로 밀린다.
 */
export function compareRank(a: RankLike, b: RankLike): number {
  const tierDiff = tierOrder(a.tier) - tierOrder(b.tier)
  if (tierDiff !== 0) return tierDiff
  const rankDiff = rankOrder(a.rank) - rankOrder(b.rank)
  if (rankDiff !== 0) return rankDiff
  return (b.lp ?? 0) - (a.lp ?? 0)
}
