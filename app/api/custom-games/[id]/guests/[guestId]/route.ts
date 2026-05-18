import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getCurrentUser } from '@/lib/supabase/route'

type Ctx = { params: Promise<{ id: string; guestId: string }> }

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { guestId } = await ctx.params

  const { error } = await supabaseAdmin
    .from('custom_game_guests')
    .delete()
    .eq('id', guestId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
