export type ParticipantOrderRow = {
  id: string
  joined_at: string
}

/**
 * 대기열은 물리 컬럼이 아니라 순번에서 파생된다.
 *
 * `status('confirmed'|'waitlisted')`를 저장하면 취소마다 승격 UPDATE가 필요해지고,
 * 동시 취소 2건이 같은 대기자를 중복 승격하거나 아무도 승격하지 못하는 경합이 생긴다.
 * `(joined_at, id)` 정렬 상위 capacity명을 확정으로 계산하면 취소는 DELETE 1건뿐이고
 * 승격 로직 자체가 존재하지 않으므로 승격 경합도 존재하지 않는다.
 *
 * 호출자는 정렬을 보장하지 않아도 된다 — 여기서 다시 정렬한다.
 */
export function splitParticipants<T extends ParticipantOrderRow>(
  rows: readonly T[],
  capacity: number,
): { confirmed: T[]; waitlist: T[] } {
  const sorted = [...rows].sort(compareByOrder)
  const size = Number.isFinite(capacity) && capacity > 0 ? Math.floor(capacity) : 0
  return { confirmed: sorted.slice(0, size), waitlist: sorted.slice(size) }
}

function compareByOrder(a: ParticipantOrderRow, b: ParticipantOrderRow): number {
  const ta = Date.parse(a.joined_at)
  const tb = Date.parse(b.joined_at)
  if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) return ta - tb
  // 동일 타임스탬프(또는 파싱 불가)일 때의 tie-break. DB 인덱스 정렬과 동일하게 id를 쓴다.
  if (a.id === b.id) return 0
  return a.id < b.id ? -1 : 1
}

/**
 * 게스트는 별도 테이블에 있지만 같은 정원을 소비한다.
 * 게스트가 늘면 확정 멤버 수가 줄어드는데, 이는 정원 하향과 동일한 UX 이슈일 뿐
 * 정합성 문제는 아니다(순번은 그대로 유지된다).
 */
export function effectiveMemberCapacity(capacity: number, guestCount: number): number {
  return Math.max(0, capacity - guestCount)
}
