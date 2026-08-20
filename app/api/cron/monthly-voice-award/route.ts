import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getKstTodayDate, formatDiscordVoiceDuration } from '@/lib/discord/activityHelpers'
import { fetchDiscordMemberActivity } from '@/lib/discord/memberActivity'
import { notifyMonthlyVoiceTop } from '@/lib/discord/notify'

export const dynamic = 'force-dynamic'

/** 음성 1위에게 줄 포인트. */
const AWARD_POINTS = Number(process.env.MONTHLY_VOICE_AWARD_POINTS ?? '100')

/**
 * 매달 1일 실행: 전월(KST) 디스코드 음성 활동 1위에게 포인트를 지급한다.
 * - 멱등: reference_key=voice_top:YYYY-MM (award_monthly_voice_top 이 중복이면 already_applied).
 * - 외부 스케줄러(GitHub Actions, .github/workflows/monthly-voice-award.yml)가 1일에 호출한다.
 * - 인증: Authorization: Bearer CRON_SECRET(또는 ADMIN_SYNC_TOKEN).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = process.env.CRON_SECRET ?? process.env.ADMIN_SYNC_TOKEN
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 전월 1일 ~ 말일 (KST 기준). 오늘이 9/1 이면 8월 전체를 집계한다.
  const [year, month] = getKstTodayDate().split('-').map(Number)
  const prevYear = month === 1 ? year - 1 : year
  const prevMonth = month === 1 ? 12 : month - 1
  const mm = String(prevMonth).padStart(2, '0')
  const from = `${prevYear}-${mm}-01`
  const to = new Date(Date.UTC(prevYear, prevMonth, 0)).toISOString().slice(0, 10) // 전월 말일
  const monthKey = `${prevYear}-${mm}`
  const monthLabel = `${prevYear}년 ${prevMonth}월`

  const activity = await fetchDiscordMemberActivity({ from, to }, { includeUnlinked: false })
  if (activity.status !== 'ready') {
    return NextResponse.json({ ok: false, reason: 'activity_unavailable', month: monthKey })
  }

  // 승인 멤버 중 음성 시간 1위(활동 데이터 매칭됨, voiceSeconds > 0). rows 는 이미 음성 desc 정렬.
  const winner = activity.rows.find((row) => row.memberId && row.voiceSeconds > 0)
  if (!winner || !winner.memberId) {
    return NextResponse.json({ ok: true, awarded: false, reason: 'no_voice_activity', month: monthKey })
  }

  const { data, error } = await supabaseAdmin.rpc('award_monthly_voice_top', {
    p_member_id: winner.memberId,
    p_amount: AWARD_POINTS,
    p_reference_key: `voice_top:${monthKey}`,
    p_description: `${monthLabel} 디스코드 음성 활동 1위`,
  })
  if (error) {
    console.error('[monthly-voice-award] RPC 실패', error.message)
    return NextResponse.json({ ok: false, reason: 'grant_failed', detail: error.message, month: monthKey }, { status: 500 })
  }

  const result = Array.isArray(data) ? data[0] : data
  const status = (result as { status?: string } | null)?.status ?? 'unknown'
  const voiceText = formatDiscordVoiceDuration(winner.voiceSeconds)

  // 새로 지급된 경우에만 디스코드로 발표한다(중복 실행 시 재발표 방지).
  if (status === 'granted') {
    try { await notifyMonthlyVoiceTop(monthLabel, winner.displayName, voiceText, AWARD_POINTS) }
    catch (e) { console.warn('[monthly-voice-award] 발표 알림 실패', e instanceof Error ? e.message : '오류') }
  }

  return NextResponse.json({
    ok: true,
    awarded: status === 'granted',
    status,
    month: monthKey,
    winner: { memberId: winner.memberId, name: winner.displayName, voiceSeconds: winner.voiceSeconds },
    points: AWARD_POINTS,
  })
}
