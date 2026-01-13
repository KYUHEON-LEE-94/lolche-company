// app/api/admin/sync-all/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncOneMember } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'

const DEFAULT_BATCH = Number(process.env.SYNC_ALL_BATCH ?? '20')
const MEMBER_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '800')
const STALE_HOURS = Number(process.env.SYNC_STALE_HOURS ?? '1')
const INCLUDE_RUNNING = false

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * 공용 실행 함수
 */
async function runSyncAll(params: { limit?: number; cursorId?: string | null }) {
  const limit = params.limit ?? DEFAULT_BATCH
  const cursorId = params.cursorId ?? null

  const staleSince = new Date(
      Date.now() - STALE_HOURS * 3600 * 1000,
  ).toISOString()

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
    return NextResponse.json(
        { error: '멤버 조회 실패', detail: String(error) },
        { status: 500 },
    )
  }

  const results = []

  for (const m of members ?? []) {
    const r = await syncOneMember(m.id, doSyncMember)

    results.push({
      memberId: m.id,
      memberName: m.member_name,
      ok: r.ok,
      status: r.status,
      error: r.error ?? null,
    })

    if (MEMBER_DELAY_MS > 0) await sleep(MEMBER_DELAY_MS)
  }

  const nextCursorId =
      members && members.length ? members[members.length - 1].id : cursorId
  const done = !members || members.length < limit

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
  return runSyncAll({
    limit: Number(body.limit),
    cursorId: body.cursorId ?? null,
  })
}

/**
 * ✅ GET: Vercel Cron 실행
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)

  return runSyncAll({
    limit: searchParams.get('limit')
        ? Number(searchParams.get('limit'))
        : undefined,
    cursorId: searchParams.get('cursorId'),
  })
}
