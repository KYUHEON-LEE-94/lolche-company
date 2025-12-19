// app/api/admin/sync-all/route.ts
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncOneMember} from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'

const DEFAULT_BATCH = Number(process.env.SYNC_ALL_BATCH ?? '10')
const MEMBER_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '800')
const STALE_HOURS = Number(process.env.SYNC_STALE_HOURS ?? '1') // 6시간 이상 지난 멤버만
const INCLUDE_RUNNING = false // running 제외 추천

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const limit = Number(body.limit ?? DEFAULT_BATCH)
  const cursorId = body.cursorId ?? null

  const staleSince = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString()

  // ✅ stale 대상 조회 (+ running 제외)
  let q = supabaseAdmin
  .from('members')
  .select('id, member_name, last_synced_at, sync_status')
  .or(`last_synced_at.is.null,last_synced_at.lt.${staleSince}`)
  .neq('sync_status', 'running')
  .order('id', { ascending: true })
  .limit(limit)

  if (cursorId) q = q.gt('id', cursorId)

  if (!INCLUDE_RUNNING) {
    // running인 멤버는 스킵 (중복 실행 방지)
    q = q.neq('sync_status', 'running')
  }

  const { data: members, error } = await q

  if (error) {
    return NextResponse.json({ error: '멤버 조회 실패', detail: String(error) }, { status: 500 })
  }

  const results: Array<{
    memberId: string
    memberName: string | null
    ok: boolean
    status: number
    error: string | null
  }> = []

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

  const nextCursorId = members?.length ? members[members.length - 1].id : cursorId
  const done = !members || members.length < limit

  return NextResponse.json({
    batch: { limit, cursorId, nextCursorId, done },
    processed: results.length,
    results,
  })
}
