import type { MouseEvent } from 'react'
import { GAME_KINDS, type GameKind, type GameStatus, type LolMode, type LolPosition } from './constants'

/**
 * 클라이언트 컴포넌트에서도 쓰는 표시 전용 헬퍼.
 * ⚠ server-only 모듈(`./game`)을 import하지 않는다.
 */

/**
 * `<input type="date|time">` 는 우측 아이콘을 눌러야만 피커가 열린다.
 * 입력창 아무 곳이나 클릭해도 열리도록 showPicker() 를 호출한다.
 * showPicker 는 최신 브라우저에만 있고(미지원 시 undefined), 사용자 제스처가 아니거나
 * 숨겨진 입력이면 throw 하므로 옵셔널 호출 + try/catch 로 감싼다.
 * 미지원 브라우저는 기존 아이콘 클릭 동작으로 자연 degrade 된다.
 */
export function openNativePicker(e: MouseEvent<HTMLInputElement>) {
  const input = e.currentTarget
  // ⚠ onMouseDown 으로 연결해야 한다(onClick 아님).
  //   mousedown 은 focus 이전에 발화하므로, 이미 포커스된 입력을 다시 클릭한 경우
  //   (시/분 세그먼트 편집·스피너 조작)에는 activeElement 가 이 입력이라 피커를 재오픈하지 않는다.
  //   매 클릭마다 showPicker() 를 부르면 피커가 닫혔다 다시 열리며 편집을 가로챈다.
  if (document.activeElement === input) return
  try {
    input.showPicker?.()
  } catch {
    // NotAllowedError / InvalidStateError 등은 무시 — 아이콘 클릭으로 폴백
  }
}

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

/** 롤 모드 한국어 표기 (aram=증바람, rift=협곡) */
export const LOL_MODE_LABELS: Record<LolMode, string> = {
  aram: '증바람',
  rift: '협곡',
}

export function lolModeLabel(mode: string | null | undefined): string {
  return mode && mode in LOL_MODE_LABELS ? LOL_MODE_LABELS[mode as LolMode] : ''
}

/** 협곡 포지션 한국어 표기 */
export const POSITION_LABELS: Record<LolPosition, string> = {
  top: '탑',
  jungle: '정글',
  mid: '미드',
  adc: '원딜',
  support: '서폿',
}

export function positionLabel(position: string | null | undefined): string {
  return position && position in POSITION_LABELS ? POSITION_LABELS[position as LolPosition] : ''
}

export function gameKindLabel(kind: string | null | undefined, label: string | null | undefined): string {
  if (kind === 'etc') return label?.trim() || '기타'
  // 스팀은 게임명이 선택적이다. 있으면 게임명을, 없으면 '스팀'을 배지에 쓴다.
  if (kind === 'steam') return label?.trim() || GAME_KIND_LABELS.steam
  if (kind && kind in GAME_KIND_LABELS) return GAME_KIND_LABELS[kind as GameKind]
  return '롤체'
}

/** 스팀 스토어 캡슐 이미지. app/steam/page.tsx 와 동일 규격을 쓴다. */
export function steamCapsuleUrl(appid: number): string {
  // header.jpg 는 capsule_231x87.jpg 보다 커버리지가 넓다(신작 다수가 capsule 404).
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`
}

export const GAME_KIND_BADGE: Record<GameKind, string> = {
  tft: 'bg-amber-500/10 border-amber-500/20 text-warn-ink',
  lol: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
  steam: 'bg-emerald-500/10 border-emerald-500/20 text-ok-ink',
  etc: 'bg-slate-500/10 border-slate-500/20 text-muted',
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
  recruiting: 'bg-indigo-500/10 border-indigo-500/20 text-brand-ink',
  in_progress: 'bg-emerald-500/10 border-emerald-500/20 text-ok-ink',
  ended: 'bg-slate-500/10 border-slate-500/20 text-muted',
  cancelled: 'bg-red-500/10 border-red-500/20 text-danger-ink',
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
