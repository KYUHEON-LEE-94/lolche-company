'use client'

import { useSyncExternalStore } from 'react'
import { applyTheme, currentTheme, storedTheme, systemTheme, type Theme } from '@/lib/theme'

// <html data-theme> 를 단일 진실 소스로 구독한다. 토글은 attribute 만 바꾸고,
// MutationObserver 가 스냅샷 변화를 알려 리렌더한다 → useEffect + setState 불필요.
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

  // 사용자가 수동 선택(localStorage)하기 전까지만 OS 테마 변경을 추종한다.
  const mql = window.matchMedia('(prefers-color-scheme: dark)')
  const onMedia = () => {
    if (storedTheme() === null) applyTheme(systemTheme(), false)
  }
  mql.addEventListener('change', onMedia)

  return () => {
    observer.disconnect()
    mql.removeEventListener('change', onMedia)
  }
}

// 하이드레이션 이후에만 아이콘을 그려 서버/클라 불일치를 피한다(과거 mounted 플래그 대체).
const noopSubscribe = () => () => {}

/** 무의존성 라이트/다크 토글. FOUC 스크립트가 심어둔 data-theme 를 구독해 동기화한다. */
export default function ThemeToggle({ className = '' }: { className?: string }) {
  const theme = useSyncExternalStore<Theme>(subscribeTheme, currentTheme, () => 'dark')
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false)

  const isDark = theme === 'dark'

  function toggle() {
    // attribute 변경 → subscribeTheme 의 MutationObserver 가 리렌더를 유발한다.
    applyTheme(isDark ? 'light' : 'dark', true)
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted hover:text-fg hover:bg-surface-2 transition-colors ${className}`}
    >
      {/* mounted 전에는 서버/클라 불일치를 피하려 아이콘을 그리지 않는다(버튼 크기만 유지). */}
      {mounted &&
        (isDark ? (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        ))}
    </button>
  )
}
