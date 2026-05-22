import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params

  // 참가자 결과 조회
  const { data: parts, error: partsError } = await supabaseAdmin
    .from('tft_match_participants')
    .select('match_id, placement, level, augments, traits, units, time_eliminated')
    .eq('member_id', memberId)

  if (partsError) return NextResponse.json({ error: partsError.message }, { status: 500 })
  if (!parts || parts.length === 0) return NextResponse.json({ matches: [] })

  const matchIds = parts.map((p) => p.match_id)

  // 매치 메타데이터를 game_datetime 기준 최신 5개
  const { data: matchRows, error: matchError } = await supabaseAdmin
    .from('tft_matches')
    .select('match_id, game_datetime, game_length_seconds, queue_id')
    .in('match_id', matchIds)
    .order('game_datetime', { ascending: false })
    .limit(5)

  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 })

  const partsMap = new Map(parts.map((p) => [p.match_id, p]))

  const matches = (matchRows ?? []).map((m) => ({
    ...m,
    ...(partsMap.get(m.match_id) ?? {}),
  }))

  return NextResponse.json({ matches })
}
