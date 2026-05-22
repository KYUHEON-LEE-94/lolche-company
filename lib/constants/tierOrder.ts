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
