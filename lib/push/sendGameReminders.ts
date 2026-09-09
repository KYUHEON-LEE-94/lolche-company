import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingColumnError, isMissingTableError } from '@/lib/db/pgErrors'
import { effectiveMemberCapacity, splitParticipants } from '@/lib/customGames/waitlist'
import { formatKstSchedule, gameKindLabel, lolModeLabel } from '@/lib/customGames/display'
import { isPushConfigured, sendPushToTargets, type PushTarget } from '@/lib/push/webPush'

/**
 * 대기자에게도 보낼지. 대기자는 그 시각에 플레이하지 않으므로 기본 false
 * (알림이 오정보가 된다). 정책을 뒤집으려면 이 상수만 바꾼다.
 */
const PUSH_TO_WAITLIST = false

const configuredWindow = Number(process.env.PUSH_REMINDER_WINDOW_MIN ?? '60')
const WINDOW_MIN =
  Number.isFinite(configuredWindow) && configuredWindow > 0 && configuredWindow <= 360
    ? configuredWindow
    : 60

const TARGET_STATUSES = ['recruiting', 'in_progress']

type PushGameRow = {
  id: string
  title: string
  game_kind: string
  game_kind_label: string | null
  lol_mode: string | null
  capacity: number
  scheduled_at: string
  host_member_id: string | null
}

export type PushReminderResult = {
  sent: number
  failed: number
  games: number
  skipped: string | null
  migrationRequired: boolean
}

const EMPTY: PushReminderResult = { sent: 0, failed: 0, games: 0, skipped: null, migrationRequired: false }

function skip(reason: string, migrationRequired = false): PushReminderResult {
  return { ...EMPTY, skipped: reason, migrationRequired }
}

/** 확정 인원 ∪ 주최자. 게스트가 정원을 잠식해 주최자가 대기로 밀릴 수 있어 합집합으로 둔다. */
async function resolveTargetMemberIds(game: PushGameRow): Promise<string[] | null> {
  const [participants, guests] = await Promise.all([
    supabaseAdmin
      .from('custom_game_participants')
      .select('id, member_id, joined_at')
      .eq('custom_game_id', game.id),
    supabaseAdmin
      .from('custom_game_guests')
      .select('id', { count: 'exact', head: true })
      .eq('custom_game_id', game.id),
  ])

  if (participants.error) return null

  const rows = (participants.data ?? []) as { id: string; member_id: string; joined_at: string }[]
  const guestCount = guests.error ? 0 : guests.count ?? 0
  const capacity = effectiveMemberCapacity(game.capacity, guestCount)
  const { confirmed, waitlist } = splitParticipants(rows, capacity)

  const ids = new Set<string>()
  for (const row of confirmed) ids.add(row.member_id)
  if (PUSH_TO_WAITLIST) for (const row of waitlist) ids.add(row.member_id)
  if (game.host_member_id) ids.add(game.host_member_id)
  return [...ids]
}

/**
 * 내전 시작 WINDOW_MIN(기본 60)분 이내 · 미발송 내전의 참가자 기기로 웹 푸시를 1회 보낸다.
 *
 * ★ 기존 30분 디스코드 채널 알림과 **완전히 독립적**이다 — 별도 쿼리 · 별도 컬럼
 *   (`push_reminder_sent_at`) · 별도 창. 같은 select 에 컬럼을 얹으면 마이그레이션 미적용
 *   환경에서 42703 이 나 30분 알림이 통째로 죽는다.
 */
export async function sendCustomGamePushReminders(now: Date): Promise<PushReminderResult> {
  if (!isPushConfigured()) return skip('vapid_not_configured')

  const until = new Date(now.getTime() + WINDOW_MIN * 60_000)

  const { data, error } = await supabaseAdmin
    .from('custom_games')
    .select('id, title, game_kind, game_kind_label, lol_mode, capacity, scheduled_at, host_member_id')
    .in('status', TARGET_STATUSES)
    .is('push_reminder_sent_at', null)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', until.toISOString())
    .order('scheduled_at', { ascending: true })

  if (error) {
    if (isMissingColumnError(error) || isMissingTableError(error)) {
      return skip('migration_required', true)
    }
    console.error('[push-reminders] 내전 조회 실패', error.message)
    return skip('query_failed')
  }

  const games = (data ?? []) as PushGameRow[]
  let sent = 0
  let failed = 0
  let handled = 0

  for (const game of games) {
    const memberIds = await resolveTargetMemberIds(game)
    if (!memberIds) continue

    // 선점: 실제로 내가 찍은 경우에만 발송한다(동시 실행 경합에도 내전당 1회).
    // 구독이 0건이어도 선점은 수행해 매 폴링마다 같은 내전을 재조회하지 않는다.
    const { data: claimed } = await supabaseAdmin
      .from('custom_games')
      .update({ push_reminder_sent_at: new Date().toISOString() })
      .eq('id', game.id)
      .is('push_reminder_sent_at', null)
      .select('id')
      .maybeSingle()

    if (!claimed) continue
    handled += 1
    if (memberIds.length === 0) continue

    const { data: subs, error: subsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('member_id', memberIds)

    if (subsError) {
      if (isMissingTableError(subsError)) return { sent, failed, games: handled, skipped: 'migration_required', migrationRequired: true }
      console.error('[push-reminders] 구독 조회 실패', subsError.message)
      continue
    }

    const targets = (subs ?? []) as PushTarget[]
    if (targets.length === 0) continue

    const kindText =
      game.game_kind === 'lol'
        ? `롤 · ${lolModeLabel(game.lol_mode) || '협곡'}`
        : gameKindLabel(game.game_kind, game.game_kind_label)

    const result = await sendPushToTargets(targets, {
      title: `⏰ 곧 시작 — ${game.title}`,
      body: `${kindText} · ${formatKstSchedule(game.scheduled_at)}`,
      url: `/custom-games/${game.id}`,
      tag: `cg-${game.id}`,
    })

    sent += result.sent
    failed += result.failed

    if (result.goneIds.length > 0) {
      // 410/404 = 브라우저가 폐기한 구독. 다음 발송에서 또 실패하지 않도록 정리한다.
      await supabaseAdmin.from('push_subscriptions').delete().in('id', result.goneIds)
    }
  }

  return { sent, failed, games: handled, skipped: null, migrationRequired: false }
}
