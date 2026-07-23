import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchPuuid, RiotApiError } from '@/lib/riot/api'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import { rejectClosedGame, rejectNonTftGame } from '@/lib/customGames/game'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const { data, error } = await supabaseAdmin
    .from('custom_game_guests')
    .select('id, display_name, riot_puuid, joined_at')
    .eq('custom_game_id', id)
    .order('joined_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ guests: data ?? [] })
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params

  const auth = await authorizeGameManage(gameId)
  if (!auth.ok) return auth.response
  const { game } = auth

  const notTft = rejectNonTftGame(game)
  if (notTft) return notTft
  const closed = rejectClosedGame(game)
  if (closed) return closed

  const body = (await req.json()) as {
    display_name: string
    riot_game_name: string
    riot_tagline: string
  }
  const { display_name, riot_game_name, riot_tagline } = body

  if (!display_name?.trim()) {
    return NextResponse.json({ error: '표시 이름을 입력하세요' }, { status: 400 })
  }
  if (!riot_game_name?.trim() || !riot_tagline?.trim()) {
    return NextResponse.json({ error: 'Riot ID를 입력하세요 (게임명#태그)' }, { status: 400 })
  }

  // 게스트도 멤버와 같은 정원을 소비한다. 멤버 신청 수는 대기자를 포함하므로
  // 합산으로 막으면 대기자가 있는 순간 게스트를 영원히 못 넣는다 — 게스트 자체 상한만 본다.
  // (게스트가 늘면 확정 멤버 수가 줄어드는데, 이는 정원 하향과 동일한 UX 이슈일 뿐이다.)
  const { count: guestCount } = await supabaseAdmin
    .from('custom_game_guests')
    .select('id', { count: 'exact', head: true })
    .eq('custom_game_id', gameId)

  if ((guestCount ?? 0) + 1 > game.capacity) {
    return NextResponse.json(
      { error: `게스트를 포함한 참가자는 최대 ${game.capacity}명입니다` },
      { status: 400 },
    )
  }

  // Riot API로 PUUID 조회
  let puuid: string
  try {
    puuid = await fetchPuuid(riot_game_name.trim(), riot_tagline.trim())
  } catch (e) {
    const msg = e instanceof RiotApiError && e.status === 404
      ? `Riot ID를 찾을 수 없습니다: ${riot_game_name}#${riot_tagline}`
      : e instanceof Error ? e.message : 'Riot API 오류'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const { data: guest, error: insertError } = await supabaseAdmin
    .from('custom_game_guests')
    .insert({ custom_game_id: gameId, display_name: display_name.trim(), riot_puuid: puuid })
    .select('id, display_name, riot_puuid')
    .single()

  if (insertError || !guest) {
    return NextResponse.json({ error: insertError?.message ?? '게스트 추가 실패' }, { status: 500 })
  }

  return NextResponse.json({ guest })
}
