import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingColumnError } from '@/lib/customGames/game'
import { sendDiscordWebhook, DISCORD_COLOR, type DiscordEmbed } from '@/lib/discord/notify'
import { formatKstSchedule, gameKindLabel, lolModeLabel } from '@/lib/customGames/display'

export const dynamic = 'force-dynamic'

/** 시작 몇 분 전부터 "임박" 알림을 보낼지. */
const WINDOW_MIN = Number(process.env.REMINDER_WINDOW_MIN ?? '30')

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

  if (error) {
    // 20260734 미적용(reminder_sent_at 부재) → 크론을 실패로 만들지 않고 안내만 남긴다.
    if (isMissingColumnError(error)) {
      return NextResponse.json({ ok: true, migration_required: true, sent: 0 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const games = (data ?? []) as GameRow[]
  if (games.length === 0) return NextResponse.json({ ok: true, sent: 0 })

  // 주최자 이름 조회(한 번에).
  const hostIds = [...new Set(games.map((g) => g.host_member_id).filter((v): v is string => !!v))]
  const { data: hosts } = hostIds.length
    ? await supabaseAdmin.from('members').select('id, member_name').in('id', hostIds)
    : { data: [] as { id: string; member_name: string }[] }
  const hostName = new Map((hosts ?? []).map((h) => [h.id, h.member_name]))

  const origin = new URL(req.url).origin
  let sent = 0

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
    sent += 1
  }

  return NextResponse.json({ ok: true, sent })
}
