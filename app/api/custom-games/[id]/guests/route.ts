import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchPuuid, RiotApiError } from '@/lib/riot/api'

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

  const { data: game } = await supabaseAdmin
    .from('custom_games')
    .select('id, status')
    .eq('id', gameId)
    .single()

  if (!game) return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
  if (game.status === 'ended') {
    return NextResponse.json({ error: '이미 종료된 내전입니다' }, { status: 400 })
  }

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

  // 참가자 + 게스트 수 합계 확인 (최대 8명)
  const [{ count: memberCount }, { count: guestCount }] = await Promise.all([
    supabaseAdmin
      .from('custom_game_participants')
      .select('*', { count: 'exact', head: true })
      .eq('custom_game_id', gameId),
    supabaseAdmin
      .from('custom_game_guests')
      .select('*', { count: 'exact', head: true })
      .eq('custom_game_id', gameId),
  ])
  if ((memberCount ?? 0) + (guestCount ?? 0) >= 8) {
    return NextResponse.json({ error: '참가자는 최대 8명입니다' }, { status: 400 })
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
