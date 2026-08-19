import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { parseActivityPeriod, getKstTodayDate } from '@/lib/discord/activityHelpers'
import { fetchDiscordMemberActivity } from '@/lib/discord/memberActivity'

export const dynamic = 'force-dynamic'

/**
 * 관리자 Discord 활동 조회. from/to(YYYY-MM-DD, KST)로 임의 기간을 집계한다.
 * - 일/주/월/기간지정은 전부 프런트에서 from/to 로 환산해 보낸다.
 * - 파라미터 누락/오류 시 최근 7일로 폴백.
 */
export async function GET(req: Request) {
  const { ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const period =
    parseActivityPeriod(searchParams.get('from'), searchParams.get('to')) ?? defaultRecentWeek()

  const result = await fetchDiscordMemberActivity(period, { includeUnlinked: true })
  return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
}

/** 파라미터가 없거나 잘못됐을 때의 기본 창: 최근 7일(KST). */
function defaultRecentWeek() {
  const to = getKstTodayDate()
  const fromMs = Date.parse(`${to}T00:00:00Z`) - 6 * 24 * 60 * 60 * 1000
  const from = new Date(fromMs).toISOString().slice(0, 10)
  return { from, to }
}
