import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const STALE_HOURS = 2 // 이 시간 이상 미동기화면 '지연'으로 본다
const VALID_STATUS = new Set(['success', 'skipped', 'error'])

export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403, headers: NO_STORE })

  const url = new URL(request.url)
  const status = url.searchParams.get('status') ?? ''
  const parsedLimit = Number(url.searchParams.get('limit') ?? '80')
  const limit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 300 ? parsedLimit : 80

  let logsQuery = supabaseAdmin
    .from('sync_logs')
    .select('id,type,member_id,status,message,duration_ms,created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (VALID_STATUS.has(status)) logsQuery = logsQuery.eq('status', status)

  const [{ data: logs, error: logErr }, { data: members, error: memErr }] = await Promise.all([
    logsQuery,
    supabaseAdmin.from('members').select('id,member_name,last_synced_at').eq('status', 'approved'),
  ])
  if (logErr || memErr) {
    console.error('[admin/sync-logs]', logErr?.message ?? memErr?.message)
    return NextResponse.json({ error: '로그를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }

  const names = new Map((members ?? []).map((m) => [m.id, m.member_name]))

  // 지연(stale) 요약
  const now = Date.now()
  const staleMs = STALE_HOURS * 3600_000
  let lastSyncedAt: string | null = null
  const stale: { id: string; member_name: string; last_synced_at: string | null }[] = []
  for (const m of members ?? []) {
    if (m.last_synced_at && (!lastSyncedAt || m.last_synced_at > lastSyncedAt)) lastSyncedAt = m.last_synced_at
    const age = m.last_synced_at ? now - new Date(m.last_synced_at).getTime() : Infinity
    if (age > staleMs) stale.push({ id: m.id, member_name: m.member_name, last_synced_at: m.last_synced_at })
  }
  stale.sort((a, b) => (a.last_synced_at ?? '').localeCompare(b.last_synced_at ?? ''))

  // 최근 로그 상태 카운트(불러온 범위 기준)
  const counts = { success: 0, skipped: 0, error: 0 }
  for (const l of logs ?? []) {
    if (l.status === 'success') counts.success++
    else if (l.status === 'skipped') counts.skipped++
    else if (l.status === 'error') counts.error++
  }

  return NextResponse.json({
    summary: {
      last_synced_at: lastSyncedAt,
      stale_hours: STALE_HOURS,
      stale_count: stale.length,
      approved_count: (members ?? []).length,
      counts,
    },
    stale: stale.slice(0, 30),
    logs: (logs ?? []).map((l) => ({
      id: l.id,
      type: l.type,
      status: l.status,
      member_name: l.member_id ? (names.get(l.member_id) ?? '알 수 없는 멤버') : '—',
      message: l.message,
      duration_ms: l.duration_ms,
      created_at: l.created_at,
    })),
  }, { headers: NO_STORE })
}
