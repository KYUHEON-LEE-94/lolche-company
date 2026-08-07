import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { UUID_RE, isRecord } from '@/lib/calendar/events'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const POST_KEYS = new Set(['memberId', 'amount', 'requestId', 'description'])

export async function GET(request: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403, headers: NO_STORE })
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 50)
  const parsedLimit = Number(url.searchParams.get('ledgerLimit') ?? '30')
  const ledgerLimit = Number.isInteger(parsedLimit) && parsedLimit >= 1 && parsedLimit <= 100 ? parsedLimit : 30

  const membersQuery = supabaseAdmin.from('members').select('id,member_name,status').eq('status', 'approved').order('member_name')
  const [{ data: members, error: memberError }, { data: accounts, error: accountError }, { data: ledger, error: ledgerError }, { data: actors }] = await Promise.all([
    membersQuery,
    supabaseAdmin.from('point_accounts').select('member_id,balance'),
    supabaseAdmin.from('point_ledger').select('id,member_id,amount,description,balance_after,created_at,created_by').eq('reason', 'admin_adjustment').order('created_at', { ascending: false }).limit(ledgerLimit),
    supabaseAdmin.from('admins').select('user_id,display_name'),
  ])
  const error = memberError ?? accountError ?? ledgerError
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ error: '포인트 마이그레이션이 필요합니다', migration_required: true }, { status: 503, headers: NO_STORE })
    console.error('[admin/points] 조회 실패', error.message)
    return NextResponse.json({ error: '포인트 정보를 불러오지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }
  const balances = new Map((accounts ?? []).map((row) => [row.member_id, row.balance]))
  const names = new Map((members ?? []).map((row) => [row.id, row.member_name]))
  const actorNames = new Map((actors ?? []).filter((row) => row.user_id).map((row) => [row.user_id as string, row.display_name ?? '관리자']))
  return NextResponse.json({
    members: (members ?? []).filter((row) => !q || row.member_name.toLocaleLowerCase('ko-KR').includes(q.toLocaleLowerCase('ko-KR'))).slice(0, 100).map((row) => ({ id: row.id, name: row.member_name, balance: balances.get(row.id) ?? 0 })),
    ledger: (ledger ?? []).map((row) => ({
      id: row.id,
      member_name: names.get(row.member_id) ?? '알 수 없는 멤버',
      amount: row.amount,
      description: row.description,
      balance_after: row.balance_after,
      created_at: row.created_at,
      actor_name: row.created_by ? actorNames.get(row.created_by) ?? '관리자' : '관리자',
    })),
  }, { headers: NO_STORE })
}

export async function POST(request: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403, headers: NO_STORE })
  const body: unknown = await request.json().catch(() => null)
  if (!isRecord(body) || Object.keys(body).some((key) => !POST_KEYS.has(key))) return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400, headers: NO_STORE })
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  if (typeof body.memberId !== 'string' || !UUID_RE.test(body.memberId) || typeof body.requestId !== 'string' || !UUID_RE.test(body.requestId) || typeof body.amount !== 'number' || !Number.isInteger(body.amount) || body.amount === 0 || body.amount < -10000 || body.amount > 10000 || description.length < 1 || description.length > 200) {
    return NextResponse.json({ error: '멤버, 포인트(-10,000~10,000, 0 제외), 사유를 확인해 주세요.' }, { status: 400, headers: NO_STORE })
  }
  const { data, error } = await supabaseAdmin.rpc('grant_member_points', { p_member_id: body.memberId, p_amount: body.amount, p_request_id: body.requestId, p_actor_user_id: admin.user.id, p_description: description })
  if (error) {
    if (isMissingFunctionError(error) || isMissingTableError(error)) return NextResponse.json({ error: '포인트 마이그레이션이 필요합니다', migration_required: true }, { status: 503, headers: NO_STORE })
    console.error('[admin/points] 지급 실패', error.message)
    return NextResponse.json({ error: '포인트를 지급하지 못했습니다.' }, { status: 500, headers: NO_STORE })
  }
  const result = data?.[0]
  if (!result) return NextResponse.json({ error: '지급 결과가 없습니다.' }, { status: 500, headers: NO_STORE })
  const statusCode = result.status === 'forbidden' ? 403 : result.status === 'not_found' ? 404 : result.status === 'insufficient' ? 409 : result.status === 'request_conflict' ? 409 : result.status.startsWith('invalid_') ? 400 : 200
  return NextResponse.json(result, { status: statusCode, headers: NO_STORE })
}
