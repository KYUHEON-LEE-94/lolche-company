// lib/tournament/findCommonMatch.ts
// 내전 참가자들이 함께 플레이한 TFT 게임 탐색

import { fetchMatchIdsByPuuid, fetchMatchById } from '@/lib/riot/api'

const RIOT_MATCH_DETAIL_DELAY_MS = Number(process.env.RIOT_MATCH_DETAIL_DELAY_MS ?? '1200')

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export type MatchResult = {
  matchId: string
  playedAt: string | null
  placements: { puuid: string; placement: number }[]
}

/**
 * 참가자 PUUID 목록을 받아 모두가 함께 플레이한 가장 최근 게임을 반환합니다.
 * excludeMatchIds에 포함된 게임은 제외합니다 (이미 기록된 라운드).
 */
export async function findCommonMatch(
  puuids: string[],
  excludeMatchIds: string[] = [],
  lookback = 20,
): Promise<MatchResult | null> {
  if (puuids.length === 0) return null

  // 모든 참가자의 최근 매치 ID를 병렬로 조회 — 한 명 실패 시 에러 전파
  const settled = await Promise.allSettled(
    puuids.map((puuid) => fetchMatchIdsByPuuid(puuid, lookback)),
  )
  const failed = settled.find((r) => r.status === 'rejected')
  if (failed) throw (failed as PromiseRejectedResult).reason
  const allMatchIdArrays = (settled as PromiseFulfilledResult<string[]>[]).map((r) => r.value)

  // 교집합: 모든 참가자의 히스토리에 존재하는 매치 ID
  const sets = allMatchIdArrays.map((ids) => new Set(ids))
  const commonIds = [...sets[0]].filter((id) => sets.every((s) => s.has(id)))

  // 이미 기록된 라운드 제외
  const excludeSet = new Set(excludeMatchIds)
  const candidates = commonIds.filter((id) => !excludeSet.has(id))

  if (candidates.length === 0) return null

  // 가장 최근 공통 매치 상세 조회
  const matchId = candidates[0]
  if (RIOT_MATCH_DETAIL_DELAY_MS > 0) await sleep(RIOT_MATCH_DETAIL_DELAY_MS)

  const match = await fetchMatchById(matchId)
  const placements = match.info.participants.map((p) => ({
    puuid: p.puuid,
    placement: p.placement,
  }))

  const playedAt = match.info.game_datetime
    ? new Date(match.info.game_datetime).toISOString()
    : null

  return { matchId, playedAt, placements }
}
