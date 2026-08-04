import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'

export const dynamic = 'force-dynamic'

const PRIVATE_NO_STORE = {
  'Cache-Control': 'private, no-store',
}

export async function GET() {
  const admin = await requireAdmin()
  if (!admin.ok) {
    return new NextResponse(null, { status: 204, headers: PRIVATE_NO_STORE })
  }

  const { data, count, error } = await admin.supabase
    .schema('public')
    .from('members')
    .select('id,member_name,requested_at,created_at', { count: 'exact' })
    .eq('status', 'pending')
    .order('requested_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    console.error('[pending-members] 승인 대기 조회 실패', error.message)
    return NextResponse.json(
      { ok: false },
      { status: 500, headers: PRIVATE_NO_STORE },
    )
  }

  const recent = (data ?? []).map((member) => ({
    id: member.id,
    memberName: member.member_name,
    requestedAt: member.requested_at ?? member.created_at,
  }))

  return NextResponse.json(
    { ok: true, pendingCount: count ?? 0, recent },
    { headers: PRIVATE_NO_STORE },
  )
}
