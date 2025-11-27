// app/api/members/[id]/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type Params = {
  params: { id: string }
}

export async function DELETE(
    req: Request,
    { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const memberId = id

  // 1) 해당 멤버가 존재하는지 체크 (선택이지만 에러 메시지 예쁘게 하려고)
  const { data: member, error: memberError } = await supabase
      .from('members')
      .select('id, member_name')
      .eq('id', memberId)
      .single()

  if (memberError) {
    console.error('member select error', memberError)
    return NextResponse.json(
        { error: '멤버 조회 중 오류가 발생했습니다.' },
        { status: 500 },
    )
  }

  if (!member) {
    return NextResponse.json(
        { error: '해당 멤버를 찾을 수 없습니다.' },
        { status: 404 },
    )
  }

  // 2) 전적 테이블에서 이 멤버 관련 데이터 먼저 삭제
  const { error: partDeleteError } = await supabase
      .from('tft_match_participants')
      .delete()
      .eq('member_id', memberId)

  if (partDeleteError) {
    console.error('tft_match_participants delete error', partDeleteError)
    return NextResponse.json(
        { error: '전적 삭제 중 오류가 발생했습니다.' },
        { status: 500 },
    )
  }

  // 3) members row 삭제
  const { error: memberDeleteError } = await supabase
      .from('members')
      .delete()
      .eq('id', memberId)

  if (memberDeleteError) {
    console.error('members delete error', memberDeleteError)
    return NextResponse.json(
        { error: '멤버 삭제 중 오류가 발생했습니다.' },
        { status: 500 },
    )
  }

  return NextResponse.json({
    message: '멤버 삭제 완료',
    memberId,
  })
}
