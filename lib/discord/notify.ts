import 'server-only'

/**
 * 디스코드 웹훅 전송. ⚠ 서버 전용 — DISCORD_WEBHOOK_URL 은 클라이언트에 노출 금지.
 *   URL 이 변경될 수 있으므로 코드에 박지 않고 env 로만 읽는다.
 *   알림 실패가 본 작업(내전 생성 등)을 절대 깨뜨리지 않도록 모든 오류를 삼킨다.
 */

const TIMEOUT_MS = 4000

export type DiscordEmbed = {
  title?: string
  description?: string
  url?: string
  color?: number
  fields?: { name: string; value: string; inline?: boolean }[]
  timestamp?: string
}

export async function sendDiscordWebhook(embeds: DiscordEmbed[], content?: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL
  if (!url) return // 미설정이면 조용히 건너뛴다(로컬·미구성 환경 degrade).

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(content ? { content } : {}), embeds }),
      signal: controller.signal,
    })
    if (!res.ok) {
      // 본문·URL 은 로그에 싣지 않는다(웹훅 토큰이 URL 에 있으므로).
      console.warn('[discord] 웹훅 응답 비정상:', res.status)
    }
  } catch (e) {
    console.warn('[discord] 웹훅 전송 실패:', e instanceof Error ? e.message : '오류')
  } finally {
    clearTimeout(timer)
  }
}

/** 내전 종류 색상(Discord embed color, 10진수). */
export const DISCORD_COLOR = {
  tft: 0xf59e0b, // amber
  lol: 0x38bdf8, // sky
  steam: 0x22c55e, // emerald
  etc: 0x94a3b8, // slate
  reminder: 0x6366f1, // indigo
} as const
