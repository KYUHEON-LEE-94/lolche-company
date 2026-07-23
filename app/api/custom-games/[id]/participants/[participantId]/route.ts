import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; participantId: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, participantId } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response
  const { game } = auth

  if (game.status === 'ended' || game.status === 'cancelled') {
    return NextResponse.json({ error: '종료된 내전은 수정할 수 없습니다' }, { status: 400 })
  }

  // 다른 내전의 참가자 id를 넘겨 강퇴하는 것을 막기 위해 custom_game_id로 함께 좁힌다.
  const { data: participant, error: lookupError } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id, member_id')
    .eq('id', participantId)
    .eq('custom_game_id', id)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!participant) {
    return NextResponse.json({ error: '참가자를 찾을 수 없습니다' }, { status: 404 })
  }

  if (game.host_member_id !== null && participant.member_id === game.host_member_id) {
    return NextResponse.json(
      { error: '주최자는 강퇴할 수 없습니다. 내전을 삭제하세요.' },
      { status: 400 },
    )
  }

  const { error } = await supabaseAdmin
    .from('custom_game_participants')
    .delete()
    .eq('id', participantId)
    .eq('custom_game_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
