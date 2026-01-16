// app/api/admin/sync-all/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncOneMember } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'
import { writeSyncLog } from '@/lib/sync/writeSyncLog'

const DEFAULT_BATCH = Number(process.env.SYNC_ALL_BATCH ?? '20')
const MEMBER_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '800')
const STALE_HOURS = Number(process.env.SYNC_STALE_HOURS ?? '1')
const INCLUDE_RUNNING = false

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
}

/**
 * ✅ Cron에서만 로그 TTL 정리 (성공: 7일, 나머지: 30일)
 */
async function cleanupSyncLogs() {
  const successBefore = isoDaysAgo(7)
  const othersBefore = isoDaysAgo(30)

  // success 7일 초과 삭제
  const { error: e1 } = await supabaseAdmin
      .from('sync_logs')
      .delete()
      .eq('status', 'success')
      .lt('created_at', successBefore)

  if (e1) console.error('[sync-all] cleanup success logs error', e1)

  // skipped/error 30일 초과 삭제
  const { error: e2 } = await supabaseAdmin
      .from('sync_logs')
      .delete()
      .neq('status', 'success')
      .lt('created_at', othersBefore)

  if (e2) console.error('[sync-all] cleanup other logs error', e2)

  console.log('[sync-all] cleanup done', { successBefore, othersBefore })
}

/**
 * 공용 실행 함수
 */
async function runSyncAll(params: {
  limit?: number
  cursorId?: string | null
  trigger: 'cron' | 'manual'
  doCleanup?: boolean
  req?: Request
}) {
  const startedAt = Date.now()
  const limit = params.limit ?? DEFAULT_BATCH
  const cursorId = params.cursorId ?? null

  const staleSince = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString()

  // ✅ Vercel 콘솔에서 cron 호출인지 눈으로 바로 확인
  const vercelCron = params.req?.headers.get('x-vercel-cron') // 있으면 cron 호출일 가능성 높음
  console.log('[sync-all] start', {
    trigger: params.trigger,
    vercelCron,
    limit,
    cursorId,
    staleSince,
    includeRunning: INCLUDE_RUNNING,
  })

  // ✅ cron일 때만 TTL 정리 (추가 cron 필요 없음)
  if (params.doCleanup) {
    await cleanupSyncLogs()
  }

  let q = supabaseAdmin
      .from('members')
      .select('id, member_name, last_synced_at, sync_status')
      .or(`last_synced_at.is.null,last_synced_at.lt.${staleSince}`)
      .order('id', { ascending: true })
      .limit(limit)

  if (cursorId) q = q.gt('id', cursorId)
  if (!INCLUDE_RUNNING) q = q.neq('sync_status', 'running')

  const { data: members, error } = await q
  if (error) {
    console.error('[sync-all] members query error', error)
    return NextResponse.json({ error: '멤버 조회 실패', detail: String(error) }, { status: 500 })
  }

  if (!members || members.length === 0) {
    const { count: totalCount } = await supabaseAdmin
        .from('members')
        .select('*', { count: 'exact', head: true })

    const { count: runningCount } = await supabaseAdmin
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('sync_status', 'running')

    console.log('[sync-all] empty result debug', { totalCount, runningCount })
  }

  console.log('[sync-all] fetched members', { count: members?.length ?? 0 })

  const results: any[] = []

  for (const m of members ?? []) {
    const t0 = Date.now()

    try {
      const r = await syncOneMember(m.id, doSyncMember)

      let status: 'success' | 'skipped' | 'error'

      if (!r.ok) {
        status = 'error'
      } else if (r.error) {
        status = 'skipped'
      } else {
        status = 'success'
      }

      // ✅ 멤버별 DB 로그
      await writeSyncLog({
        type: params.trigger === 'cron' ? 'cron' : 'manual',
        memberId: m.id,
        status,
        message: r.error
            ? r.error
            : r.status != null
                ? String(r.status)
                : null,
        durationMs: Date.now() - t0,
      })

      // ✅ 멤버별 콘솔 로그
      console.log('[sync-all] member result', {
        memberId: m.id,
        memberName: m.member_name,
        ok: r.ok,
        status: r.status,
        error: r.error ?? null,
        durationMs: Date.now() - t0,
      })

      results.push({
        memberId: m.id,
        memberName: m.member_name,
        ok: r.ok,
        status: r.status,
        error: r.error ?? null,
        durationMs: Date.now() - t0,
      })
    } catch (e: any) {
      console.error('[sync-all] member exception', { memberId: m.id, e })

      await writeSyncLog({
        type: params.trigger === 'cron' ? 'cron' : 'manual',
        memberId: m.id,
        status: 'error',
        message: e?.message ?? 'member sync exception',
        durationMs: Date.now() - t0,
      })

      results.push({
        memberId: m.id,
        memberName: m.member_name,
        ok: false,
        status: 'error',
        error: e?.message ?? 'member sync exception',
        durationMs: Date.now() - t0,
      })
    }

    if (MEMBER_DELAY_MS > 0) await sleep(MEMBER_DELAY_MS)
  }

  const nextCursorId = members && members.length ? members[members.length - 1].id : cursorId
  const done = !members || members.length < limit

  console.log('[sync-all] end', {
    processed: results.length,
    done,
    nextCursorId,
    elapsedMs: Date.now() - startedAt,
  })

  return NextResponse.json({
    batch: { limit, cursorId, nextCursorId, done },
    processed: results.length,
    results,
  })
}

/**
 * ✅ POST: 관리자 수동 실행
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const parsedLimit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined
  return runSyncAll({
    limit: parsedLimit,
    cursorId: body.cursorId ?? null,
    trigger: 'manual',
    doCleanup: false,
    req,
  })
}

/**
 * ✅ GET: Vercel Cron 실행
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('limit')
  const parsedLimit = raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined
  return runSyncAll({
    limit: parsedLimit,
    cursorId: searchParams.get('cursorId'),
    trigger: 'cron',
    doCleanup: true, // ✅ cron 실행 시 로그 TTL 정리까지 같이
    req,
  })
}
