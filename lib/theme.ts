// 테마 전환 순수 헬퍼. server-only 금지 — 클라이언트 컴포넌트가 import 한다.
// localStorage 키 'theme' 는 사용자가 수동 선택했을 때만 기록된다(=OS override).
// 값이 없으면 matchMedia 로 OS 설정을 추종한다.

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'theme'

export function systemTheme(): Theme {
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** 현재 <html data-theme> 에 심긴 실제 테마를 읽는다(FOUC 스크립트가 이미 심어둠). */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'
}

/** 테마를 적용하고, persist=true 면 수동 선택으로 저장한다. */
export function applyTheme(theme: Theme, persist: boolean) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', theme)
  }
  if (persist) {
    try {
      window.localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* 사설 모드 등에서 localStorage 접근 불가 — 무시 */
    }
  }
}

export function storedTheme(): Theme | null {
  try {
    const v = window.localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}
