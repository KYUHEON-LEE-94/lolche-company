import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGameManager } from '@/lib/customGames/authorize'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const { data: game, error: gameError } = await supabaseAdmin
    .from('custom_games')
    .select('id, title, status, game_type, max_rounds, created_at, ended_at')
    .eq('id', id)
    .single()

  if (gameError || !game) {
    return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
  }

  // ── 멤버 참가자 ──────────────────────────────────────────────────
  const { data: participantRows } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id, member_id')
    .eq('custom_game_id', id)
    .order('joined_at')

  const memberIds = (participantRows ?? []).map((p) => p.member_id)

  const { data: memberRows } = await supabaseAdmin
    .from('members')
    .select('id, member_name, riot_game_name, riot_tagline, riot_puuid')
    .in('id', memberIds.length > 0 ? memberIds : ['__none__'])

  const memberMap = new Map((memberRows ?? []).map((m) => [m.id, m]))

  const participants = (participantRows ?? []).map((p) => {
    const m = memberMap.get(p.member_id)
    return {
      id: p.id,
      member_id: p.member_id,
      member_name: m?.member_name ?? '알 수 없음',
      riot_game_name: m?.riot_game_name ?? '',
      riot_tagline: m?.riot_tagline ?? '',
      riot_puuid: m?.riot_puuid ?? null,
    }
  })

  // ── 게스트 참가자 ─────────────────────────────────────────────────
  const { data: guestRows } = await supabaseAdmin
    .from('custom_game_guests')
    .select('id, display_name, riot_puuid')
    .eq('custom_game_id', id)
    .order('joined_at')

  const guests = guestRows ?? []

  // ── 라운드 + 결과 ─────────────────────────────────────────────────
  const { data: roundRows } = await supabaseAdmin
    .from('custom_game_rounds')
    .select('id, round_number, match_id, played_at')
    .eq('custom_game_id', id)
    .order('round_number')

  const roundIds = (roundRows ?? []).map((r) => r.id)
  const hasRounds = roundIds.length > 0
  const safeRoundIds = hasRounds ? roundIds : ['__none__']

  const [{ data: resultRows }, { data: guestResultRows }] = await Promise.all([
    supabaseAdmin
      .from('custom_game_results')
      .select('round_id, member_id, placement, points')
      .in('round_id', safeRoundIds),
    supabaseAdmin
      .from('custom_game_guest_results')
      .select('round_id, guest_id, placement, points')
      .in('round_id', safeRoundIds),
  ])

  const resultsByRound = new Map<string, { member_id: string; placement: number; points: number }[]>()
  const guestResultsByRound = new Map<string, { guest_id: string; placement: number; points: number }[]>()

  ;(resultRows ?? []).forEach((r) => {
    const arr = resultsByRound.get(r.round_id) ?? []
    arr.push(r)
    resultsByRound.set(r.round_id, arr)
  })
  ;(guestResultRows ?? []).forEach((r) => {
    const arr = guestResultsByRound.get(r.round_id) ?? []
    arr.push(r)
    guestResultsByRound.set(r.round_id, arr)
  })

  const rounds = (roundRows ?? []).map((r) => ({
    ...r,
    results: resultsByRound.get(r.id) ?? [],
    guest_results: guestResultsByRound.get(r.id) ?? [],
  }))

  // ── 팀 배정 (팀전만 조회) ─────────────────────────────────────────
  let teams: { round_number: number; team_index: number; member_id: string | null; guest_id: string | null }[] = []
  if (game.game_type === 'team') {
    const { data: teamRows } = await supabaseAdmin
      .from('custom_game_teams')
      .select('round_number, team_index, member_id, guest_id')
      .eq('custom_game_id', id)
      .order('round_number')
      .order('team_index')
    teams = teamRows ?? []
  }

  return NextResponse.json({ game, participants, guests, rounds, teams })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  // B1: 임시로 관리자 전용. B2에서 canManageGame(주최자 본인 + 관리자)으로 완화된다.
  const denied = await requireGameManager()
  if (denied) return denied

  const { id } = await ctx.params
  const { error } = await supabaseAdmin.from('custom_games').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
