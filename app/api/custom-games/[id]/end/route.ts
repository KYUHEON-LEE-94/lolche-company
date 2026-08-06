import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response

  if (auth.game.status === 'cancelled') {
    return NextResponse.json({ error: '이미 종료된 내전입니다' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.rpc('end_custom_game_and_award_points', {
    p_game_id: id,
  })

  if (error) {
    if (isMissingFunctionError(error) || isMissingTableError(error)) {
      return NextResponse.json({ error: '포인트 마이그레이션이 필요합니다', migration_required: true }, { status: 503 })
    }
    console.error('[custom-games/end] 종료 및 포인트 지급 실패', error.message)
    return NextResponse.json({ error: '내전을 종료하지 못했습니다' }, { status: 500 })
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result || result.status === 'not_found') {
    return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
  }
  if (result.status === 'invalid_status') {
    return NextResponse.json({ error: '취소된 내전은 종료할 수 없습니다' }, { status: 400 })
  }

  return NextResponse.json({ ok: true, ...result })
}
