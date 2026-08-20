import 'server-only'
import { tierOrder } from '@/lib/constants/tierOrder'

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
  calendar: 0xec4899, // pink
} as const

// ── 티어 승급 축하 ────────────────────────────────────────────────────────────

const TIER_KO: Record<string, string> = {
  IRON: '아이언',
  BRONZE: '브론즈',
  SILVER: '실버',
  GOLD: '골드',
  PLATINUM: '플래티넘',
  EMERALD: '에메랄드',
  DIAMOND: '다이아몬드',
  MASTER: '마스터',
  GRANDMASTER: '그랜드마스터',
  CHALLENGER: '챌린저',
}

const GAME_KO = { tft: '롤체', lol: '롤' } as const

function tierKo(tier: string): string {
  return TIER_KO[tier.toUpperCase()] ?? tier
}

/**
 * 티어 "등급 자체"가 오른 경우(예: 실버 → 골드)에만 디스코드로 축하 알림을 보낸다.
 *   - 디비전 상승(실버 IV → 실버 III)은 대상 아님 — 티어명이 같으면 무시.
 *   - 강등·언랭(null) 변화도 무시.
 *   - 승급이 아니면 아무것도 보내지 않는다(호출부에서 조건 판단 불필요).
 * TIER_ORDER 는 낮을수록 높은 티어(CHALLENGER=1 … IRON=10)다.
 */
export async function notifyTierPromotion(
  memberName: string,
  game: 'tft' | 'lol',
  oldTier: string | null | undefined,
  newTier: string | null | undefined,
): Promise<void> {
  if (!oldTier || !newTier) return
  const o = tierOrder(oldTier)
  const n = tierOrder(newTier)
  if (o >= 999 || n >= 999) return // 알 수 없는 티어
  // ★ n < o 일 때(= 새 티어가 더 높을 때)만 발송한다.
  //   n === o: 같은 티어(디비전 상승) → 제외. n > o: 강등 → 반드시 제외.
  if (n >= o) return

  await sendDiscordWebhook([
    {
      title: `🎉 승급 축하합니다! ${memberName}`,
      description: `**${tierKo(oldTier)} → ${tierKo(newTier)}** 승급 (${GAME_KO[game]})`,
      color: DISCORD_COLOR[game],
      timestamp: new Date().toISOString(),
    },
  ])
}

// ── TOP 5 진입 알림 ───────────────────────────────────────────────────────────

/** 롤체 랭킹 TOP 5 에 새로 진입한 멤버를 축하한다. entrants 가 비면 아무것도 보내지 않는다. */
export async function notifyTop5Entry(
  entrants: { name: string; rank: number; rankLabel: string }[],
): Promise<void> {
  if (entrants.length === 0) return
  await sendDiscordWebhook([
    {
      title: '🏆 롤체 랭킹 TOP 5 진입!',
      description: entrants
        .map((e) => `**${e.rank}위 · ${e.name}** — ${e.rankLabel}`)
        .join('\n'),
      color: DISCORD_COLOR.tft,
      timestamp: new Date().toISOString(),
    },
  ])
}

// ── 시즌 마감 임박 ────────────────────────────────────────────────────────────

/** 활성 시즌 종료가 임박했을 때 1회 알린다. daysLeft 는 남은 일수(정수). */
export async function notifySeasonEndingSoon(
  seasonName: string,
  endAtIso: string,
  daysLeft: number,
): Promise<void> {
  const when = new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
  }).format(new Date(endAtIso))
  await sendDiscordWebhook([
    {
      title: '⏳ 시즌 마감 임박',
      description: `**${seasonName}** 시즌이 약 **${daysLeft}일 후**(${when}) 마감됩니다.\n마지막 랭크를 챙겨두세요!`,
      color: DISCORD_COLOR.reminder,
      timestamp: new Date().toISOString(),
    },
  ])
}

/** 매달 전월 음성 활동 1위 발표 + 포인트 지급 알림. */
export async function notifyMonthlyVoiceTop(
  monthLabel: string,
  memberName: string,
  voiceText: string,
  points: number,
): Promise<void> {
  await sendDiscordWebhook([
    {
      title: '🎙️ 이달의 음성왕',
      description: `**${monthLabel}** 디스코드 음성 활동 1위는 **${memberName}** 님!\n총 음성 시간 **${voiceText}** · 보상 **+${points}P** 지급 완료 🎉`,
      color: DISCORD_COLOR.etc,
      timestamp: new Date().toISOString(),
    },
  ])
}
