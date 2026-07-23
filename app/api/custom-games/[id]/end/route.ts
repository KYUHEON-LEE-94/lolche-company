import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGameManager } from '@/lib/customGames/authorize'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  // B1: 임시로 관리자 전용. B2에서 canManageGame(주최자 본인 + 관리자)으로 완화된다.
  const denied = await requireGameManager()
  if (denied) return denied

  const { id } = await ctx.params

  const { error } = await supabaseAdmin
    .from('custom_games')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
