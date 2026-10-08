// 브라우저 전용. 'server-only' 금지, lib/push/webPush.ts(VAPID 개인키 경계) import 금지.

const CLEANUP_TIMEOUT_MS = 3000

async function unsubscribeCurrentDevice(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // ready 는 등록이 실패했으면 영원히 pending 이라 로그아웃을 멈춘다 — getRegistration 만 쓴다.
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration || !('pushManager' in registration)) return
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return

  // 서버 DELETE 는 member_id 조건이라 세션이 살아 있는 signOut 이전에 보내야 한다.
  await fetch('/api/me/push-subscription', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    keepalive: true,
  }).catch(() => undefined)
  await subscription.unsubscribe().catch(() => undefined)
}

/**
 * 로그아웃 직전 이 기기의 푸시 구독을 해제한다. 공용 기기에서 로그아웃 후에도
 * 이전 사용자의 내전 알림이 계속 오는 것을 막는다.
 * best-effort — 실패·타임아웃이어도 throw 하지 않으며 호출자는 로그아웃을 그대로 진행한다.
 */
export async function cleanupPushSubscription(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      unsubscribeCurrentDevice(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, CLEANUP_TIMEOUT_MS)
      }),
    ])
  } catch {
    // 무시 — 로그아웃이 우선이다.
  } finally {
    if (timer) clearTimeout(timer)
  }
}
