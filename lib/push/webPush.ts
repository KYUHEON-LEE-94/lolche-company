import 'server-only'
import webpush from 'web-push'

/** 구독 1건. `id` 는 만료(410/404) 시 삭제 대상을 돌려주기 위해 필요하다. */
export type PushTarget = { id: string; endpoint: string; p256dh: string; auth: string }
export type PushPayload = { title: string; body: string; url: string; tag?: string }
export type PushSendResult = { sent: number; failed: number; goneIds: string[] }

/** 임박 알림은 늦게 도착하면 의미가 없다. 30분 뒤에는 폐기한다. */
const TTL_SECONDS = 1800

const warnedKeys = new Set<string>()
function warnOnce(key: string, message: string) {
  if (warnedKeys.has(key)) return
  warnedKeys.add(key)
  console.warn(message)
}

function vapidEnv() {
  return {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY,
    subject: process.env.VAPID_SUBJECT,
  }
}

/** VAPID 3종이 모두 있어야 푸시를 시도한다. 하나라도 없으면 전체 skip(기존 알림은 계속). */
export function isPushConfigured(): boolean {
  const { publicKey, privateKey, subject } = vapidEnv()
  return Boolean(publicKey && privateKey && subject)
}

let configured = false

function ensureConfigured(): boolean {
  if (configured) return true
  const { publicKey, privateKey, subject } = vapidEnv()
  if (!publicKey || !privateKey || !subject) {
    warnOnce('vapid-missing', '[push] VAPID 환경변수 미설정 — 웹 푸시 발송을 건너뜁니다.')
    return false
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey)
    configured = true
    return true
  } catch (e) {
    // 키 형식 오류 등. 개인키 자체는 절대 로그에 싣지 않는다.
    warnOnce('vapid-invalid', `[push] VAPID 설정 실패 — ${e instanceof Error ? e.message : '오류 발생'}`)
    return false
  }
}

function statusCodeOf(e: unknown): number | undefined {
  return (e as { statusCode?: number } | null)?.statusCode
}

/**
 * 대상 구독 전부에 발송한다. 개별 실패가 나머지를 막지 않는다.
 * 반환 `goneIds` 는 410/404(만료)로 판정된 구독 id — 호출자가 DELETE 한다.
 */
export async function sendPushToTargets(
  targets: readonly PushTarget[],
  payload: PushPayload,
): Promise<PushSendResult> {
  if (targets.length === 0) return { sent: 0, failed: 0, goneIds: [] }
  if (!ensureConfigured()) return { sent: 0, failed: 0, goneIds: [] }

  const body = JSON.stringify(payload)
  let sent = 0
  let failed = 0
  const goneIds: string[] = []

  for (const target of targets) {
    try {
      await webpush.sendNotification(
        { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
        body,
        { TTL: TTL_SECONDS },
      )
      sent += 1
    } catch (e) {
      const code = statusCodeOf(e)
      if (code === 404 || code === 410) {
        goneIds.push(target.id)
      } else {
        failed += 1
        // endpoint 는 기기 식별자에 가까우므로 로그에 싣지 않는다.
        console.warn(`[push] 발송 실패(${code ?? 'unknown'}) — ${e instanceof Error ? e.message : '오류 발생'}`)
      }
    }
  }

  return { sent, failed, goneIds }
}
