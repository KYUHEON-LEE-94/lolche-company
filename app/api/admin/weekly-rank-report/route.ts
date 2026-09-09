import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingTableError, isMissingFunctionError } from '@/lib/db/pgErrors'
import { buildWeeklyReportEmbed, collectWeeklyReport } from '@/lib/discord/weeklyReport'
import { notifyWeeklyRankReport } from '@/lib/discord/notify'

export const dynamic = 'force-dynamic'

/**
 * 주간 랭크 리포트 수동 실행 / 미리보기.
 * - `?dry_run=1` : claim 도 발송도 하지 않고 계산된 임베드 JSON 만 반환한다(QA 검증용).
 * - `?force=1`   : claim 을 건너뛰고 강제 발송(중복 감수, 운영자 판단).
 * - 기본         : 크론과 동일하게 claim → 발송 → 실패 시 release.
 * ★ 세션 기반 requireAdmin 을 쓰므로 proxy BYPASS 인 /api/cron 아래가 아니라 /api/admin 아래에 둔다.
 */
export async function POST(req: Request) {
  const { ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 401 })

  const url = new URL(req.url)
  const dryRun = url.searchParams.get('dry_run') === '1'
  const force = url.searchParams.get('force') === '1'

  let data
  try {
    data = await collectWeeklyReport()
  } catch (e) {
    const message = e instanceof Error ? e.message : '오류 발생'
    return NextResponse.json({ ok: false, reason: 'collect_failed', detail: message }, { status: 500 })
  }

  const embed = buildWeeklyReportEmbed(data)
  const weekKey = data.window.weekKey

  if (dryRun) {
    return NextResponse.json({ ok: true, sent: false, dry_run: true, week: weekKey, embed })
  }

  if (!data.hasAny) {
    return NextResponse.json({ ok: true, sent: false, reason: 'no_data', week: weekKey })
  }

  let prevWeek: string | null = null
  if (!force) {
    const { data: claimData, error: claimError } = await supabaseAdmin.rpc('claim_weekly_rank_report', {
      p_week_key: weekKey,
    })
    if (claimError) {
      if (isMissingTableError(claimError) || isMissingFunctionError(claimError)) {
        return NextResponse.json({ ok: false, sent: false, reason: 'migration_required', week: weekKey }, { status: 503 })
      }
      return NextResponse.json({ ok: false, sent: false, reason: 'claim_failed', week: weekKey }, { status: 500 })
    }
    const claim = Array.isArray(claimData) ? claimData[0] : claimData
    if (!claim?.claimed) {
      return NextResponse.json({ ok: true, sent: false, reason: 'already_sent', week: weekKey })
    }
    prevWeek = claim.last_sent_week ?? null
  }

  const result = await notifyWeeklyRankReport(embed)
  if (result !== 'sent' && !force) {
    const { error } = await supabaseAdmin.rpc('release_weekly_rank_report', {
      p_week_key: weekKey,
      p_prev_week: prevWeek,
    })
    if (error) console.error('[weekly-rank-report:admin] release 실패', error.message)
  }

  return NextResponse.json({
    ok: true,
    sent: result === 'sent',
    forced: force,
    reason: result === 'sent' ? undefined : result === 'skipped' ? 'webhook_not_configured' : 'send_failed',
    week: weekKey,
  })
}
