import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingColumnError } from '@/lib/customGames/game'
import { isMissingTableError } from '@/lib/db/pgErrors'
import { sendDiscordWebhook, DISCORD_COLOR, notifySeasonEndingSoon, type DiscordEmbed } from '@/lib/discord/notify'
import { formatKstSchedule, gameKindLabel, lolModeLabel } from '@/lib/customGames/display'

export const dynamic = 'force-dynamic'

/** 시작 몇 분 전부터 "임박" 알림을 보낼지. */
const configuredWindow = Number(process.env.REMINDER_WINDOW_MIN ?? '30')
const WINDOW_MIN = Number.isFinite(configuredWindow) && configuredWindow > 0 && configuredWindow <= 180 ? configuredWindow : 30

type GameRow = {
  id: string
  title: string
  game_kind: string
  game_kind_label: string | null
  lol_mode: string | null
  capacity: number
  scheduled_at: string
  host_member_id: string | null
}
type CalendarReminderRow = {
  id: string
  title: string
  description: string | null
  recurrence: 'none' | 'yearly'
  event_date: string | null
  event_month: number
  event_day: number
  is_all_day: boolean
  event_time: string | null
  member_id: string
  notification_sent_for: string | null
}

function kstDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value)
  const year = part('year'); const month = part('month'); const day = part('day')
  return { year, month, day, date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

async function sendCalendarReminders(req: Request, now: Date): Promise<{ sent: number; migrationRequired: boolean }> {
  const today = kstDateParts(now)
  const previous = kstDateParts(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const columns = 'id,title,description,recurrence,event_date,event_month,event_day,is_all_day,event_time,member_id,notification_sent_for'
  const [once, yearly] = await Promise.all([
    supabaseAdmin.from('calendar_events').select(columns).eq('event_type', 'event').eq('recurrence', 'none').in('event_date', [previous.date, today.date]),
    supabaseAdmin.from('calendar_events').select(columns).eq('event_type', 'event').eq('recurrence', 'yearly').or(`and(event_month.eq.${previous.month},event_day.eq.${previous.day}),and(event_month.eq.${today.month},event_day.eq.${today.day})`),
  ])
  const error = once.error ?? yearly.error
  if (error) {
    if (isMissingTableError(error) || isMissingColumnError(error)) return { sent: 0, migrationRequired: true }
    console.error('[notify-reminders] 캘린더 조회 실패', error.message)
    return { sent: 0, migrationRequired: false }
  }
  const candidates = [...(once.data ?? []), ...(yearly.data ?? [])] as CalendarReminderRow[]
  const due = candidates.flatMap((event) => {
    const occurrence = event.recurrence === 'none' ? event.event_date : (event.event_month === today.month && event.event_day === today.day ? today.date : previous.date)
    if (!occurrence) return []
    const time = event.is_all_day ? '09:00:00' : event.event_time
    if (!time) return []
    const instant = new Date(`${occurrence}T${time}+09:00`)
    if (Number.isNaN(instant.getTime()) || instant.getTime() > now.getTime() || instant.getTime() <= now.getTime() - 24 * 60 * 60 * 1000 || event.notification_sent_for === occurrence) return []
    return [{ event, occurrence, instant }]
  })
  const memberIds = [...new Set(due.map(({ event }) => event.member_id))]
  const { data: members } = memberIds.length ? await supabaseAdmin.from('members').select('id,member_name').in('id', memberIds) : { data: [] as { id: string; member_name: string }[] }
  const names = new Map((members ?? []).map((member) => [member.id, member.member_name]))
  const origin = new URL(req.url).origin
  let sent = 0
  for (const { event, occurrence, instant } of due) {
    const { data: claimed } = await supabaseAdmin.from('calendar_events').update({ notification_sent_for: occurrence }).eq('id', event.id).or(`notification_sent_for.is.null,notification_sent_for.neq.${occurrence}`).select('id').maybeSingle()
    if (!claimed) continue
    const timeText = event.is_all_day ? '하루 종일 · 09:00 알림' : `${String(event.event_time).slice(0, 5)} KST`
    await sendDiscordWebhook([{
      title: `📅 오늘의 일정 — ${event.title}`,
      url: `${origin}/#calendar`,
      description: event.description ? event.description.slice(0, 1000) : undefined,
      color: DISCORD_COLOR.calendar,
      fields: [{ name: '멤버', value: names.get(event.member_id) ?? '알 수 없음', inline: true }, { name: '시간', value: timeText, inline: true }],
      timestamp: instant.toISOString(),
    }])
    sent += 1
  }
  return { sent, migrationRequired: false }
}

/**
 * 내전 "시작 임박" 알림 크론.
 *   모집 중 + 시작 WINDOW_MIN 분 이내 + 아직 미발송 내전을 찾아 디스코드로 1회 알린 뒤
 *   reminder_sent_at 을 기록한다(중복 방지). 외부 스케줄러(GitHub Actions)가 주기적으로 호출한다.
 *   인증은 기존 크론과 동일하게 Authorization: Bearer CRON_SECRET(또는 ADMIN_SYNC_TOKEN).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = process.env.CRON_SECRET ?? process.env.ADMIN_SYNC_TOKEN
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const until = new Date(now.getTime() + WINDOW_MIN * 60_000)

  const { data, error } = await supabaseAdmin
    .from('custom_games')
    .select('id, title, game_kind, game_kind_label, lol_mode, capacity, scheduled_at, host_member_id')
    .eq('status', 'recruiting')
    .is('reminder_sent_at', null)
    .not('scheduled_at', 'is', null)
    .gte('scheduled_at', now.toISOString())
    .lte('scheduled_at', until.toISOString())
    .order('scheduled_at', { ascending: true })

  let customGameMigrationRequired = false
  if (error) {
    // 20260734 미적용(reminder_sent_at 부재) → 크론을 실패로 만들지 않고 안내만 남긴다.
    if (isMissingColumnError(error)) {
      customGameMigrationRequired = true
    } else {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const games = error ? [] : (data ?? []) as GameRow[]

  // 주최자 이름 조회(한 번에).
  const hostIds = [...new Set(games.map((g) => g.host_member_id).filter((v): v is string => !!v))]
  const { data: hosts } = hostIds.length
    ? await supabaseAdmin.from('members').select('id, member_name').in('id', hostIds)
    : { data: [] as { id: string; member_name: string }[] }
  const hostName = new Map((hosts ?? []).map((h) => [h.id, h.member_name]))

  const origin = new URL(req.url).origin
  let customGameSent = 0

  for (const g of games) {
    const kindText =
      g.game_kind === 'lol'
        ? `롤 · ${lolModeLabel(g.lol_mode) || '협곡'}`
        : gameKindLabel(g.game_kind, g.game_kind_label)

    const embed: DiscordEmbed = {
      title: `⏰ 곧 시작하는 내전 — ${g.title}`,
      url: `${origin}/custom-games/${g.id}`,
      color: DISCORD_COLOR.reminder,
      fields: [
        { name: '종류', value: kindText, inline: true },
        { name: '정원', value: `${g.capacity}명`, inline: true },
        { name: '일정', value: formatKstSchedule(g.scheduled_at), inline: false },
        { name: '주최', value: g.host_member_id ? hostName.get(g.host_member_id) ?? '알 수 없음' : '알 수 없음', inline: true },
      ],
      timestamp: new Date().toISOString(),
    }

    // ⚠ 먼저 reminder_sent_at 을 "선점"하고, 실제로 내가 찍은 경우에만 발송한다.
    //   `is null` 가드 + 반환 행 확인으로 동시 실행 경합에도 내전당 1회만 보낸다.
    //   (웹훅이 실패해도 다시 보내지 않는다 — 임박 알림은 1회성이 안전하다.)
    const { data: claimed } = await supabaseAdmin
      .from('custom_games')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', g.id)
      .is('reminder_sent_at', null)
      .select('id')
      .maybeSingle()

    if (!claimed) continue // 이미 다른 실행이 선점 → 중복 발송 방지
    await sendDiscordWebhook([embed])
    customGameSent += 1
  }

  const calendar = await sendCalendarReminders(req, now)
  const season = await sendSeasonEndReminder(now)
  return NextResponse.json({ ok: true, sent: customGameSent + calendar.sent + season.sent, custom_game_sent: customGameSent, calendar_sent: calendar.sent, season_reminder_sent: season.sent, calendar_migration_required: calendar.migrationRequired, ...(customGameMigrationRequired ? { migration_required: true } : {}) })
}

/** 시즌 마감 며칠 전부터 "임박" 알림을 보낼지(일). */
const seasonEndDays = Number(process.env.SEASON_END_REMINDER_DAYS ?? '3')
const SEASON_END_DAYS = Number.isFinite(seasonEndDays) && seasonEndDays >= 1 && seasonEndDays <= 30 ? seasonEndDays : 3

/**
 * 활성 시즌의 예약 종료(scheduled_end_at)가 SEASON_END_DAYS 이내로 들어오면 1회 알린다.
 * end_reminder_sent_at 을 선점 갱신해 중복 발송을 막는다. 컬럼 부재(20260817 미적용)는 조용히 skip.
 */
async function sendSeasonEndReminder(now: Date): Promise<{ sent: number }> {
  const { data: season, error } = await supabaseAdmin
    .from('seasons')
    .select('id, season_name, scheduled_end_at, end_reminder_sent_at')
    .eq('is_active', true)
    .maybeSingle()
  if (error) return { sent: 0 } // 컬럼/테이블 부재 등 → skip
  if (!season || !season.scheduled_end_at || season.end_reminder_sent_at) return { sent: 0 }

  const endMs = new Date(season.scheduled_end_at).getTime()
  const nowMs = now.getTime()
  const windowMs = SEASON_END_DAYS * 86_400_000
  // 종료 전 & 종료까지 SEASON_END_DAYS 이내일 때만.
  if (nowMs >= endMs || nowMs < endMs - windowMs) return { sent: 0 }

  // 선점: 실제로 내가 찍은 경우에만 발송(중복 방지).
  const { data: claimed } = await supabaseAdmin
    .from('seasons')
    .update({ end_reminder_sent_at: now.toISOString() })
    .eq('id', season.id)
    .is('end_reminder_sent_at', null)
    .select('id')
    .maybeSingle()
  if (!claimed) return { sent: 0 }

  const daysLeft = Math.max(1, Math.ceil((endMs - nowMs) / 86_400_000))
  await notifySeasonEndingSoon(season.season_name, season.scheduled_end_at, daysLeft)
  return { sent: 1 }
}
