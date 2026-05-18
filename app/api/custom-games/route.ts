import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('custom_games')
    .select('id, title, status, max_rounds, created_at, ended_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ games: data ?? [] })
}

export async function POST(req: Request) {
  const body = (await req.json()) as {
    title: string
    participant_ids: string[]
    max_rounds?: number
  }
  const { title, participant_ids, max_rounds = 5 } = body

  if (!title?.trim()) {
    return NextResponse.json({ error: '제목을 입력하세요' }, { status: 400 })
  }
  if (!participant_ids?.length || participant_ids.length < 2) {
    return NextResponse.json({ error: '참가자를 2명 이상 선택하세요' }, { status: 400 })
  }
  if (participant_ids.length > 8) {
    return NextResponse.json({ error: '참가자는 최대 8명입니다' }, { status: 400 })
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from('custom_games')
    .insert({ title: title.trim(), status: 'in_progress', max_rounds })
    .select('id')
    .single()

  if (gameError || !game) {
    return NextResponse.json({ error: gameError?.message ?? '생성 실패' }, { status: 500 })
  }

  const { error: partError } = await supabaseAdmin
    .from('custom_game_participants')
    .insert(participant_ids.map((member_id) => ({ custom_game_id: game.id, member_id })))

  if (partError) {
    await supabaseAdmin.from('custom_games').delete().eq('id', game.id)
    return NextResponse.json({ error: partError.message }, { status: 500 })
  }

  return NextResponse.json({ id: game.id })
}
