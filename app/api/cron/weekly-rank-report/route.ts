import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingTableError, isMissingFunctionError } from '@/lib/db/pgErrors'
import { buildWeeklyReportEmbed, collectWeeklyReport, getKstWeekWindow } from '@/lib/discord/weeklyReport'
import { notifyWeeklyRankReport } from '@/lib/discord/notify'

export const dynamic = 'force-dynamic'

/**
 * 매주 월요일(KST) 지난 주 롤체 랭크 리포트를 디스코드로 1회 발송한다.
 * - 멱등: weekly_rank_report_state 단일행 compare-and-set(week_key). 월요일 3회 호출해도 발송은 1회.
 * - 인증: Authorization: Bearer CRON_SECRET(또는 ADMIN_SYNC_TOKEN).
 * - ★ 마이그레이션 미적용·웹훅 미설정·이미 발송됨은 전부 200 + reason 이다.
 *   GitHub Actions 의 `curl -fsS` 가 비-2xx 에서 실패하므로 매주 빨간 워크플로를 만들지 않기 위함.
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = process.env.CRON_SECRET ?? process.env.ADMIN_SYNC_TOKEN
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { weekKey } = getKstWeekWindow()

  const { data: claimData, error: claimError } = await supabaseAdmin.rpc('claim_weekly_rank_report', {
    p_week_key: weekKey,
  })
  if (claimError) {
    if (isMissingTableError(claimError) || isMissingFunctionError(claimError)) {
      return NextResponse.json({ ok: false, sent: false, reason: 'migration_required', week: weekKey })
    }
    console.error('[weekly-rank-report] claim 실패', claimError.message)
    return NextResponse.json({ ok: false, sent: false, reason: 'claim_failed', week: weekKey }, { status: 500 })
  }

  const claim = Array.isArray(claimData) ? claimData[0] : claimData
  if (!claim?.claimed) {
    return NextResponse.json({ ok: true, sent: false, reason: 'already_sent', week: weekKey })
  }
  const prevWeek = claim.last_sent_week ?? null

  const release = async () => {
    const { error } = await supabaseAdmin.rpc('release_weekly_rank_report', {
      p_week_key: weekKey,
      p_prev_week: prevWeek,
    })
    if (error) console.error('[weekly-rank-report] release 실패', error.message)
  }

  try {
    const data = await collectWeeklyReport()
    if (!data.hasAny) {
      await release()
      return NextResponse.json({ ok: true, sent: false, reason: 'no_data', week: weekKey })
    }

    const result = await notifyWeeklyRankReport(buildWeeklyReportEmbed(data))
    if (result !== 'sent') {
      await release()
      return NextResponse.json({
        ok: true,
        sent: false,
        reason: result === 'skipped' ? 'webhook_not_configured' : 'send_failed',
        week: weekKey,
      })
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      week: weekKey,
      summary: {
        risers: data.risers.length,
        fallers: data.fallers.length,
        plays: data.plays.length,
        top3: data.top3.length,
      },
    })
  } catch (e) {
    await release()
    const message = e instanceof Error ? e.message : '오류 발생'
    console.error('[weekly-rank-report] 집계/발송 실패', message)
    return NextResponse.json({ ok: false, sent: false, reason: 'report_failed', detail: message, week: weekKey }, { status: 502 })
  }
}
