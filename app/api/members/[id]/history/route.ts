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

  const history = (data ?? []).reverse()

  // ★ 동기화가 점수 변화가 있을 때만 기록하므로(doSyncMember 의 dedup),
  //   마지막 기록은 "마지막으로 점수가 바뀐 시점"에 멈춘다. 그래프 선이 지금까지
  //   이어지도록 현재 캐시값으로 now 지점을 하나 덧붙인다.
  //   현재값이 마지막 기록과 같으면 마지막 변화 시점→지금 구간이 수평선으로 이어진다.
  if (history.length > 0) {
    const { data: member } = await supabaseAdmin
      .from('members')
      .select('tft_tier, tft_rank, tft_league_points, tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_league_points')
      .eq('id', memberId)
      .maybeSingle()

    if (member && (member.tft_league_points !== null || member.tft_doubleup_league_points !== null)) {
      history.push({
        id: 'now',
        tft_tier: member.tft_tier,
        tft_rank: member.tft_rank,
        tft_lp: member.tft_league_points,
        tft_doubleup_tier: member.tft_doubleup_tier,
        tft_doubleup_rank: member.tft_doubleup_rank,
        tft_doubleup_lp: member.tft_doubleup_league_points,
        season_id: activeSeason.id,
        recorded_at: new Date().toISOString(),
      })
    }
  }

  return NextResponse.json({ history })
}
