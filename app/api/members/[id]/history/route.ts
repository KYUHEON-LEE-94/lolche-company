import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isApprovedMember } from '@/lib/members/approved'

type Ctx = { params: Promise<{ id: string }> }

const HISTORY_LIMIT = 60

export async function GET(_req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params

  if (!(await isApprovedMember(memberId))) {
    return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 })
  }

  const { data: activeSeason } = await supabaseAdmin
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle()

  if (!activeSeason) return NextResponse.json({ history: [] })

  const { data, error } = await supabaseAdmin
    .from('member_rank_history')
    .select('id, tft_tier, tft_rank, tft_lp, tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_lp, season_id, recorded_at')
    .eq('member_id', memberId)
    .eq('season_id', activeSeason.id)
    .order('recorded_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ history: (data ?? []).reverse() })
}
