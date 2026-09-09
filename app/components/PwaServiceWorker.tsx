'use client'

import { useEffect } from 'react'

/**
 * `/sw.js` 등록 전용. 세션을 읽지 않고 렌더 결과도 없어 ISR/레이아웃에 영향이 없다.
 * 등록 실패(비 HTTPS 개발 환경, 미지원 브라우저 등)는 사이트 동작과 무관하므로 조용히 무시한다.
 */
export default function PwaServiceWorker() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])

  return null
}
