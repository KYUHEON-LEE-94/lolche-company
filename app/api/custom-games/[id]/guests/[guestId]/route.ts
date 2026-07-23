import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import { rejectNonTftGame } from '@/lib/customGames/game'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string; guestId: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id, guestId } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response

  const notTft = rejectNonTftGame(auth.game)
  if (notTft) return notTft

  // 다른 내전의 게스트 id로 삭제하는 것을 막기 위해 custom_game_id로 함께 좁힌다.
  const { error } = await supabaseAdmin
    .from('custom_game_guests')
    .delete()
    .eq('id', guestId)
    .eq('custom_game_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
