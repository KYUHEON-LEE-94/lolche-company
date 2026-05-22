import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params

  const { data, error } = await supabaseAdmin
    .from('member_rank_history')
    .select('id, tft_tier, tft_rank, tft_lp, tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_lp, recorded_at')
    .eq('member_id', memberId)
    .order('recorded_at', { ascending: true })
    .limit(30)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ history: data ?? [] })
}
