import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Ctx = { params: Promise<{ id: string; guestId: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const { guestId } = await ctx.params

  const { error } = await supabaseAdmin
    .from('custom_game_guests')
    .delete()
    .eq('id', guestId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
