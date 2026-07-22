import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/app/lib/isAdmin'
import { REJECTED_REASON_MAX } from '@/lib/members/memberInput'

export const dynamic = 'force-dynamic'

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { ok, supabase } = await requireAdmin()
  if (!ok) {
    return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })
  }

  const { id: memberId } = await ctx.params

  const body = await req.json().catch(() => null)
  const reason = String((body as { reason?: unknown } | null)?.reason ?? '').trim()

  if (reason.length > REJECTED_REASON_MAX) {
    return NextResponse.json(
      { ok: false, message: `거절 사유는 ${REJECTED_REASON_MAX}자 이하여야 합니다.` },
      { status: 400 },
    )
  }

  const { data: member, error: findError } = await supabase
    .schema('public')
    .from('members')
    .select('id, status')
    .eq('id', memberId)
    .maybeSingle()

  if (findError) {
    return NextResponse.json({ ok: false, message: findError.message }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json({ ok: false, message: '해당 멤버를 찾을 수 없습니다.' }, { status: 404 })
  }

  const { error: updateError } = await supabase
    .schema('public')
    .from('members')
    .update({
      status: 'rejected',
      rejected_reason: reason || null,
      approved_at: null,
      approved_by: null,
    })
    .eq('id', memberId)

  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 })
  }

  revalidatePath('/')
  revalidatePath('/admin/members/control')

  return NextResponse.json({ ok: true, memberId, message: '신청을 거절했습니다.' })
}
