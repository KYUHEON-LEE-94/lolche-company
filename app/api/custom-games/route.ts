import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { fetchPuuid, RiotApiError } from '@/lib/riot/api'
import { getCurrentUser } from '@/lib/supabase/route'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('custom_games')
    .select('id, title, status, game_type, max_rounds, created_at, ended_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ games: data ?? [] })
}

export async function POST(req: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const body = (await req.json()) as {
    title: string
    participant_ids: string[]
    max_rounds?: number
    game_type?: string
    guests?: { display_name: string; riot_game_name: string; riot_tagline: string }[]
  }
  const { title, participant_ids, max_rounds = 5, game_type = 'solo', guests = [] } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: '제목을 입력하세요' }, { status: 400 })
  }

  const totalCount = (participant_ids?.length ?? 0) + guests.length
  if (totalCount < 2) {
    return NextResponse.json({ error: '참가자를 2명 이상 선택하세요' }, { status: 400 })
  }
  if (totalCount > 8) {
    return NextResponse.json({ error: '참가자는 최대 8명입니다' }, { status: 400 })
  }
  if (game_type === 'team' && totalCount !== 8) {
    return NextResponse.json({ error: '팀전은 정확히 8명의 참가자가 필요합니다' }, { status: 400 })
  }

  // 게스트 PUUID 사전 조회 (게임 생성 전에 검증)
  const resolvedGuests: { display_name: string; riot_puuid: string }[] = []
  for (const g of guests) {
    if (!g.display_name?.trim() || !g.riot_game_name?.trim() || !g.riot_tagline?.trim()) {
      return NextResponse.json({ error: '게스트 정보가 올바르지 않습니다' }, { status: 400 })
    }
    try {
      const puuid = await fetchPuuid(g.riot_game_name.trim(), g.riot_tagline.trim())
      resolvedGuests.push({ display_name: g.display_name.trim(), riot_puuid: puuid })
    } catch (e) {
      const msg = e instanceof RiotApiError && e.status === 404
        ? `Riot ID를 찾을 수 없습니다: ${g.riot_game_name}#${g.riot_tagline}`
        : e instanceof Error ? e.message : 'Riot API 오류'
      return NextResponse.json({ error: msg }, { status: 400 })
    }
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from('custom_games')
    .insert({ title: title.trim(), status: 'in_progress', max_rounds, game_type })
    .select('id')
    .single()

  if (gameError || !game) {
    return NextResponse.json({ error: gameError?.message ?? '생성 실패' }, { status: 500 })
  }

  if (participant_ids?.length > 0) {
    const { error: partError } = await supabaseAdmin
      .from('custom_game_participants')
      .insert(participant_ids.map((member_id) => ({ custom_game_id: game.id, member_id })))

    if (partError) {
      await supabaseAdmin.from('custom_games').delete().eq('id', game.id)
      return NextResponse.json({ error: partError.message }, { status: 500 })
    }
  }

  if (resolvedGuests.length > 0) {
    const { error: guestError } = await supabaseAdmin
      .from('custom_game_guests')
      .insert(resolvedGuests.map((g) => ({ custom_game_id: game.id, ...g })))

    if (guestError) {
      await supabaseAdmin.from('custom_games').delete().eq('id', game.id)
      return NextResponse.json({ error: guestError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ id: game.id })
}
