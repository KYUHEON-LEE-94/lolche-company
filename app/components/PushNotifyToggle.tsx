'use client'

import { useCallback, useEffect, useState } from 'react'
import { urlBase64ToUint8Array } from '@/lib/push/clientKey'

/** 빌드타임 인라인. 비어 있으면 컴포넌트를 렌더하지 않는다. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

type Support = 'checking' | 'ok' | 'unsupported' | 'ios-needs-install'

function detectSupport(): Support {
  if (typeof window === 'undefined') return 'checking'
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  // iOS Safari 탭에는 PushManager 자체가 없다 — "미지원"이 아니라 설치 안내를 띄운다.
  if (isIos && !isStandalone) return 'ios-needs-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  return 'ok'
}

async function postSubscription(subscription: globalThis.PushSubscription): Promise<Response> {
  const json = subscription.toJSON()
  return fetch('/api/me/push-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint, keys: json.keys }),
  })
}

/**
 * 웹 푸시 구독 토글.
 *
 * 구독은 **기기(브라우저) 단위**이며 특정 내전에 종속되지 않는다. 버튼은 내전 상세에 두지만
 * 켜면 내가 참가한 모든 내전의 시작 1시간 전 알림을 이 기기에서 받는다.
 *
 * 상태의 진실은 브라우저의 `pushManager.getSubscription()` 이다(서버 GET 을 두면 기기별
 * 진실과 어긋난다). 마운트 시 로컬 구독이 있으면 멱등 POST 로 서버와 재동기화한다.
 */
export default function PushNotifyToggle() {
  const [support, setSupport] = useState<Support>('checking')
  const [subscribed, setSubscribed] = useState(false)
  const [denied, setDenied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    const detected = detectSupport()
    setSupport(detected)
    if (detected !== 'ok') return

    setDenied(Notification.permission === 'denied')

    let cancelled = false
    void (async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        const existing = await registration.pushManager.getSubscription()
        if (cancelled) return
        setSubscribed(Boolean(existing))
        // 재로그인·멤버 변경 대비 멱등 재동기화. 실패해도 UI 는 건드리지 않는다.
        if (existing) await postSubscription(existing).catch(() => undefined)
      } catch {
        // 서비스 워커 미준비 등 — 토글은 그대로 두고 사용자가 누를 때 다시 시도한다.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const enable = useCallback(async () => {
    setMessage(null)
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'denied') {
        setDenied(true)
        return
      }
      if (permission !== 'granted') return

      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }))

      const res = await postSubscription(subscription)
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null
        setMessage(body?.message ?? '알림 등록에 실패했습니다.')
        return
      }
      setSubscribed(true)
      setMessage('이 기기에서 알림을 받습니다.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '알림 등록에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }, [])

  const disable = useCallback(async () => {
    setMessage(null)
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe().catch(() => undefined)
        await fetch('/api/me/push-subscription', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined)
      }
      setSubscribed(false)
      setMessage('알림을 껐습니다.')
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '알림 해제에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }, [])

  if (!VAPID_PUBLIC_KEY) return null
  if (support === 'checking' || support === 'unsupported') return null

  if (support === 'ios-needs-install') {
    return (
      <div className="mb-6 px-4 py-3 rounded-xl bg-surface-2 border border-line text-sm">
        <p className="font-bold text-fg">아이폰은 홈 화면에 추가해야 알림을 받을 수 있어요.</p>
        <p className="text-subtle text-xs mt-0.5">
          Safari 하단 공유 버튼 → &ldquo;홈 화면에 추가&rdquo; → 홈 화면 아이콘으로 다시 열어주세요. (iOS 16.4 이상)
        </p>
      </div>
    )
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl bg-surface-2 border border-line">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-fg">🔔 시작 1시간 전 알림</p>
        <p className="text-xs text-subtle mt-0.5">
          {denied
            ? '브라우저 설정에서 이 사이트의 알림을 허용해주세요.'
            : '이 기기에서 내가 참가한 내전의 시작 1시간 전 알림을 받습니다.'}
        </p>
        {message && <p className="text-xs text-subtle mt-1">{message}</p>}
      </div>
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy || denied}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200
          disabled:opacity-40 disabled:cursor-not-allowed ${
            subscribed
              ? 'bg-surface-2 border border-line text-muted hover:text-fg'
              : 'bg-brand/10 border border-brand/30 text-brand-ink hover:bg-brand/20'
          }`}
      >
        {subscribed ? '알림 끄기' : '알림 받기'}
      </button>
    </div>
  )
}
