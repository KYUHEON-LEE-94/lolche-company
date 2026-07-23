import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response

  if (auth.game.status === 'ended' || auth.game.status === 'cancelled') {
    return NextResponse.json({ error: '이미 종료된 내전입니다' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('custom_games')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
