import { GAME_KINDS, type GameKind, type GameStatus } from './constants'

/**
 * 클라이언트 컴포넌트에서도 쓰는 표시 전용 헬퍼.
 * ⚠ server-only 모듈(`./game`)을 import하지 않는다.
 */

export const GAME_KIND_LABELS: Record<GameKind, string> = {
  tft: '롤체',
  lol: '롤',
  steam: '스팀',
  etc: '기타',
}

export const GAME_KIND_OPTIONS: { value: GameKind; label: string }[] = GAME_KINDS.map((kind) => ({
  value: kind,
  label: GAME_KIND_LABELS[kind],
}))

export function gameKindLabel(kind: string | null | undefined, label: string | null | undefined): string {
  if (kind === 'etc') return label?.trim() || '기타'
  if (kind && kind in GAME_KIND_LABELS) return GAME_KIND_LABELS[kind as GameKind]
  return '롤체'
}

export const GAME_KIND_BADGE: Record<GameKind, string> = {
  tft: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  lol: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
  steam: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  etc: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
}

export function gameKindBadgeClass(kind: string | null | undefined): string {
  if (kind && kind in GAME_KIND_BADGE) return GAME_KIND_BADGE[kind as GameKind]
  return GAME_KIND_BADGE.tft
}

export const STATUS_LABELS: Record<GameStatus, string> = {
  recruiting: '모집 중',
  in_progress: '진행중',
  ended: '종료',
  cancelled: '취소됨',
}

export const STATUS_BADGE: Record<GameStatus, string> = {
  recruiting: 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
  in_progress: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  ended: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
  cancelled: 'bg-red-500/10 border-red-500/20 text-red-400',
}

export function statusLabel(status: string): string {
  return status in STATUS_LABELS ? STATUS_LABELS[status as GameStatus] : status
}

export function statusBadgeClass(status: string): string {
  return status in STATUS_BADGE ? STATUS_BADGE[status as GameStatus] : STATUS_BADGE.ended
}

// 표시 타임존은 뷰어 브라우저와 무관하게 항상 KST로 고정한다.
const KST = 'Asia/Seoul'

const SCHEDULE_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  month: 'long',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const SHORT_FMT = new Intl.DateTimeFormat('ko-KR', {
  timeZone: KST,
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const DATE_INPUT_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: KST,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const TIME_INPUT_FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: KST,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function toDate(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatKstSchedule(iso: string | null | undefined): string {
  const d = toDate(iso)
  return d ? `${SCHEDULE_FMT.format(d)} (KST)` : '일정 미정'
}

export function formatKstShort(iso: string | null | undefined): string {
  const d = toDate(iso)
  return d ? SHORT_FMT.format(d) : '-'
}

/** `<input type="date">` 값 (KST 기준 YYYY-MM-DD) */
export function toKstDateInput(iso: string | null | undefined): string {
  const d = toDate(iso)
  return d ? DATE_INPUT_FMT.format(d) : ''
}

/** `<input type="time">` 값 (KST 기준 HH:mm) */
export function toKstTimeInput(iso: string | null | undefined): string {
  const d = toDate(iso)
  return d ? TIME_INPUT_FMT.format(d) : ''
}

export function todayKstDate(): string {
  return DATE_INPUT_FMT.format(new Date())
}
