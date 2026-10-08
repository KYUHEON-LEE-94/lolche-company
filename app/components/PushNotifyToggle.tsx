'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { urlBase64ToUint8Array } from '@/lib/push/clientKey'

/** 빌드타임 인라인. 비어 있으면 컴포넌트를 렌더하지 않는다. */
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ''

type Support = 'checking' | 'ok' | 'unsupported' | 'ios-needs-install'
/**
 * 서버 측 등록 가능 여부. 'login-required'/'no-member' 면 켜기만 막고 끄기(로컬 해제)는 허용한다.
 * 'unavailable'(503, 테이블 없음)이면 컴포넌트 자체를 숨긴다.
 */
type ServerState = 'unknown' | 'ok' | 'login-required' | 'no-member' | 'unavailable'

type ServerFailure = { state: ServerState; message: string | null }

const LOGIN_EXPIRED_MESSAGE = '로그인이 만료되었습니다. 다시 로그인한 뒤 알림을 켤 수 있어요.'

/** POST 실패 응답 → 서버 상태. 500·기타는 일시 장애로 보고 상태를 바꾸지 않는다('unknown'). */
async function classifyFailure(res: Response): Promise<ServerFailure> {
  const body = (await res.json().catch(() => null)) as { message?: string } | null
  if (res.status === 401) return { state: 'login-required', message: LOGIN_EXPIRED_MESSAGE }
  if (res.status === 400) {
    return { state: 'no-member', message: body?.message ?? '먼저 프로필에서 멤버 등록을 완료해주세요.' }
  }
  if (res.status === 503) return { state: 'unavailable', message: null }
  return { state: 'unknown', message: body?.message ?? '알림 등록에 실패했습니다.' }
}

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
  const [serverState, setServerState] = useState<ServerState>('unknown')

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
        if (!existing) return
        // 재로그인·멤버 변경 대비 멱등 재동기화. 401/400 이면 서버에 등록되지 않은 상태라 안내하고,
        // 로컬 구독은 지우지 않는다(사용자가 끄기를 누를 수 있게 남겨 둔다).
        const res = await postSubscription(existing).catch(() => null)
        if (cancelled || !res) return
        if (res.ok) {
          setServerState('ok')
          return
        }
        const failure = await classifyFailure(res)
        if (cancelled) return
        if (failure.state === 'unknown') return
        setServerState(failure.state)
        setMessage(failure.message)
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
      const existing = await registration.pushManager.getSubscription()
      // 이번 호출이 새로 만든 구독만 롤백한다 — 기존 구독은 다른 경로에서 서버에 등록돼 있을 수 있다.
      const created = !existing
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
        }))

      const rollback = async () => {
        if (created) await subscription.unsubscribe().catch(() => undefined)
        setSubscribed(false)
      }

      let res: Response
      try {
        res = await postSubscription(subscription)
      } catch (e) {
        // 서버에 등록되지 않은 구독을 남기면 토글은 켜져 보이는데 알림은 오지 않는다.
        await rollback()
        setMessage(e instanceof Error ? e.message : '알림 등록에 실패했습니다.')
        return
      }
      if (!res.ok) {
        await rollback()
        const failure = await classifyFailure(res)
        if (failure.state !== 'unknown') setServerState(failure.state)
        setMessage(failure.message)
        return
      }
      setServerState('ok')
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
  if (serverState === 'unavailable') return null

  const enableBlocked = serverState === 'login-required' || serverState === 'no-member'

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
        {serverState === 'login-required' && (
          <Link href="/login" className="mt-1 inline-block text-xs font-bold text-brand-ink underline">
            다시 로그인
          </Link>
        )}
        {serverState === 'no-member' && (
          <Link href="/profile" className="mt-1 inline-block text-xs font-bold text-brand-ink underline">
            프로필에서 멤버 등록
          </Link>
        )}
      </div>
      <button
        type="button"
        onClick={subscribed ? disable : enable}
        disabled={busy || (!subscribed && (denied || enableBlocked))}
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
