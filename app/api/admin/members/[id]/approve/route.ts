import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/app/lib/isAdmin'
import { syncOneMember } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'
import { writeSyncLog } from '@/lib/sync/writeSyncLog'

export const dynamic = 'force-dynamic'

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { ok, user, supabase } = await requireAdmin()
  if (!ok) {
    return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })
  }

  const { id: memberId } = await ctx.params

  const { data: member, error: findError } = await supabase
    .schema('public')
    .from('members')
    .select('id, member_name, status')
    .eq('id', memberId)
    .maybeSingle()

  if (findError) {
    return NextResponse.json({ ok: false, message: findError.message }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json({ ok: false, message: '해당 멤버를 찾을 수 없습니다.' }, { status: 404 })
  }
  if (member.status === 'approved') {
    return NextResponse.json({ ok: false, message: '이미 승인된 멤버입니다.' }, { status: 409 })
  }

  const { error: updateError } = await supabase
    .schema('public')
    .from('members')
    .update({
      status: 'approved',
      approved_at: new Date().toISOString(),
      approved_by: user.id,
      rejected_reason: null,
    })
    .eq('id', memberId)

  if (updateError) {
    return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 })
  }

  revalidatePath('/')
  revalidatePath('/admin/members/control')

  // 승인 자체는 이미 확정됐으므로 Riot 동기화 실패는 경고로만 돌려준다(롤백하지 않음).
  const t0 = Date.now()
  let syncWarning: string | null = null
  try {
    const result = await syncOneMember(memberId, doSyncMember)
    await writeSyncLog({
      type: 'manual',
      memberId,
      status: result.ok ? 'success' : 'error',
      message: result.error ?? null,
      durationMs: Date.now() - t0,
    })
    if (!result.ok) {
      syncWarning = result.error ?? '동기화에 실패했습니다. Riot ID를 확인해주세요.'
    }
  } catch (e) {
    syncWarning = e instanceof Error ? e.message : '동기화 중 오류가 발생했습니다.'
  }

  if (!syncWarning) revalidatePath('/')

  return NextResponse.json({
    ok: true,
    memberId,
    message: syncWarning
      ? `승인은 완료됐지만 동기화에 실패했습니다: ${syncWarning}`
      : '승인 및 동기화가 완료되었습니다.',
    syncWarning,
  })
}
