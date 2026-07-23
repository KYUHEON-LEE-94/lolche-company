// 공통 className 상수. 순수 문자열이므로 서버/클라이언트 양쪽에서 import 한다.
// ⚠ 'server-only' 를 붙이지 않는다.

// pb-24: 모바일 하단 탭바(예정)와 iOS 홈 인디케이터에 콘텐츠가 가리지 않도록 확보한다.
export const SHELL = 'min-h-[calc(100vh-3.5rem)] bg-canvas px-4 pt-8 pb-24 md:py-12'
export const CONTAINER = 'max-w-6xl mx-auto'

export const CARD = 'rounded-2xl border border-line bg-surface'
export const CARD_HOVER = `${CARD} transition-colors hover:border-line-strong`
export const PANEL = 'rounded-2xl border border-line bg-[#0d1117]/90 backdrop-blur-sm p-8'

export const INPUT =
  'w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white bg-surface-2 border border-line placeholder:text-slate-600 focus:outline-none focus:border-brand/60 disabled:opacity-50'

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-50'
export const BTN_PRIMARY = `${BTN_BASE} bg-brand text-white hover:bg-brand/85`
export const BTN_GHOST = `${BTN_BASE} bg-brand/10 border border-brand/30 text-indigo-300 hover:bg-brand/20`
export const BTN_NEUTRAL = `${BTN_BASE} bg-slate-700/60 text-slate-200 hover:bg-slate-700`
export const BTN_DANGER = `${BTN_BASE} bg-danger/90 text-white hover:bg-danger`

export const ALERT = {
  warn: 'px-4 py-3 rounded-xl text-sm font-medium bg-warn/10 border border-warn/20 text-amber-400',
  error: 'px-4 py-3 rounded-xl text-sm font-medium bg-danger/10 border border-danger/20 text-red-400',
  ok: 'px-4 py-3 rounded-xl text-sm font-medium bg-ok/10 border border-ok/20 text-emerald-400',
} as const

export const H1 = 'text-3xl sm:text-4xl font-black tracking-tight text-white'
export const H2 = 'text-lg font-black text-white'
export const KICKER = 'text-[10px] font-black tracking-[0.4em] uppercase'
export const MUTED = 'text-sm text-slate-400'
