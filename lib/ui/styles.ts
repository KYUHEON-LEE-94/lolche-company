// 공통 className 상수. 순수 문자열이므로 서버/클라이언트 양쪽에서 import 한다.
// ⚠ 'server-only' 를 붙이지 않는다.

// pb-28: 모바일 하단 탭바(56px) + iOS 홈 인디케이터에 콘텐츠가 가리지 않도록 확보한다.
// md 이상에서는 탭바가 md:hidden 이므로 원래 여백으로 되돌린다.
export const SHELL = 'min-h-[calc(100vh-3.5rem)] px-4 pt-8 pb-28 md:py-12'

// SHELL 을 쓰지 않고 자체 셸을 가진 페이지(/tft, /hall-of-fame)가 하단 탭바를 피하기 위한 여백.
export const TABBAR_SAFE_PB = 'pb-28 md:pb-0'
export const CONTAINER = 'max-w-6xl mx-auto'

export const CARD = 'rounded-2xl border border-line bg-surface shadow-[0_12px_36px_-26px_var(--color-shadow)]'
export const CARD_HOVER = `${CARD} transition-[border-color,background-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_18px_42px_-24px_var(--color-shadow)]`
export const PANEL = 'rounded-2xl border border-line bg-panel/95 backdrop-blur-md p-8 shadow-[0_24px_64px_-28px_var(--color-shadow)]'

export const INPUT =
  'w-full px-4 py-2.5 rounded-xl text-sm font-medium text-fg bg-surface-2 border border-line placeholder:text-faint transition-colors focus:outline-none focus:border-brand/60 focus-visible:ring-2 focus-visible:ring-brand/20 disabled:opacity-50'

const BTN_BASE =
  'inline-flex min-h-10 items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-[color,background-color,border-color,box-shadow] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:opacity-50 disabled:pointer-events-none'
// ⚠ BTN_PRIMARY/BTN_DANGER 의 text-white 는 필(brand/danger) 위 글자라 양 테마 흰색 유지.
export const BTN_PRIMARY = `${BTN_BASE} bg-brand text-white hover:bg-brand/85`
export const BTN_GHOST = `${BTN_BASE} bg-brand/10 border border-brand/30 text-brand-ink hover:bg-brand/20`
export const BTN_NEUTRAL = `${BTN_BASE} bg-surface-2 text-fg hover:bg-surface-2`
export const BTN_DANGER = `${BTN_BASE} bg-danger/90 text-white hover:bg-danger`

export const ALERT = {
  warn: 'px-4 py-3 rounded-xl text-sm font-medium bg-warn/10 border border-warn/20 text-warn-ink',
  error: 'px-4 py-3 rounded-xl text-sm font-medium bg-danger/10 border border-danger/20 text-danger-ink',
  ok: 'px-4 py-3 rounded-xl text-sm font-medium bg-ok/10 border border-ok/20 text-ok-ink',
} as const

export const H1 = 'text-3xl sm:text-[2.6rem] font-black tracking-[-0.035em] leading-[1.08] text-fg'
export const H2 = 'text-lg font-black tracking-[-0.02em] text-fg'
export const KICKER = 'text-[10px] font-black tracking-[0.22em] uppercase'
export const MUTED = 'text-sm text-muted'
