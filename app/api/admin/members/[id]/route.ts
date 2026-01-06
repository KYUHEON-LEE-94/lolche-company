import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> } // ✅ Promise로
) {
  const { id: memberId } = await params            // ✅ await로 언랩

  const { ok, supabase } = await requireAdmin()
  if (!ok) {
    return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })
  }

  // 1) 멤버 존재 체크
  const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, member_name')
      .eq('id', memberId)
      .maybeSingle()

  if (memberError) {
    return NextResponse.json({ ok: false, message: memberError.message }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json({ ok: false, message: '해당 멤버를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 2) 전적 삭제
  const { error: partDeleteError } = await supabase
      .from('tft_match_participants')
      .delete()
      .eq('member_id', memberId)

  if (partDeleteError) {
    return NextResponse.json({ ok: false, message: partDeleteError.message }, { status: 500 })
  }

  // 3) 멤버 삭제
  const { error: memberDeleteError } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId)

  if (memberDeleteError) {
    return NextResponse.json({ ok: false, message: memberDeleteError.message }, { status: 500 })
  }

  // ✅ 캐시 무효화
  revalidatePath('/')
  revalidatePath('/admin/members')

  return NextResponse.json({ ok: true, memberId })
}
