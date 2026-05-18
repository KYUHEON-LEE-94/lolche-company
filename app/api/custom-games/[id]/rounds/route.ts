import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { findCommonMatch } from '@/lib/tournament/findCommonMatch'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params

  const { data: game, error: gameError } = await supabaseAdmin
    .from('custom_games')
    .select('id, status, max_rounds')
    .eq('id', gameId)
    .single()

  if (gameError || !game) {
    return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
  }
  if (game.status === 'ended') {
    return NextResponse.json({ error: '이미 종료된 내전입니다' }, { status: 400 })
  }

  const { data: existingRounds } = await supabaseAdmin
    .from('custom_game_rounds')
    .select('round_number, match_id')
    .eq('custom_game_id', gameId)

  const roundCount = existingRounds?.length ?? 0
  if (roundCount >= game.max_rounds) {
    return NextResponse.json(
      { error: `최대 ${game.max_rounds}판까지만 기록할 수 있습니다` },
      { status: 400 },
    )
  }

  // ── 멤버 PUUID 조회 ──────────────────────────────────────────────
  const { data: participantRows } = await supabaseAdmin
    .from('custom_game_participants')
    .select('member_id')
    .eq('custom_game_id', gameId)

  const memberIds = (participantRows ?? []).map((p) => p.member_id)

  const { data: memberRows } = await supabaseAdmin
    .from('members')
    .select('id, riot_puuid')
    .in('id', memberIds.length > 0 ? memberIds : ['__none__'])

  const missingPuuid = (memberRows ?? []).find((m) => !m.riot_puuid)
  if (missingPuuid) {
    return NextResponse.json(
      { error: '일부 참가자의 PUUID가 없습니다. 먼저 멤버를 동기화하세요.' },
      { status: 400 },
    )
  }

  // ── 게스트 PUUID 조회 ─────────────────────────────────────────────
  const { data: guestRows } = await supabaseAdmin
    .from('custom_game_guests')
    .select('id, riot_puuid')
    .eq('custom_game_id', gameId)

  // ── PUUID 통합 맵 (PUUID → { type, id }) ─────────────────────────
  const participantByPuuid = new Map<string, { type: 'member' | 'guest'; id: string }>()
  ;(memberRows ?? []).forEach((m) => {
    if (m.riot_puuid) participantByPuuid.set(m.riot_puuid, { type: 'member', id: m.id })
  })
  ;(guestRows ?? []).forEach((g) => {
    participantByPuuid.set(g.riot_puuid, { type: 'guest', id: g.id })
  })

  const allPuuids = [...participantByPuuid.keys()]
  if (allPuuids.length === 0) {
    return NextResponse.json({ error: '참가자 정보를 찾을 수 없습니다' }, { status: 400 })
  }

  const excludeMatchIds = (existingRounds ?? []).map((r) => r.match_id)

  // ── 공통 매치 탐색 ───────────────────────────────────────────────
  let matchResult
  try {
    matchResult = await findCommonMatch(allPuuids, excludeMatchIds, 30)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Riot API 오류가 발생했습니다' },
      { status: 502 },
    )
  }

  if (!matchResult) {
    return NextResponse.json(
      { error: '참가자 전원이 함께한 TFT 게임을 최근 30판 내에서 찾을 수 없습니다. 게임 직후라면 1~2분 후 다시 시도하세요.' },
      { status: 404 },
    )
  }

  // ── 라운드 생성 ───────────────────────────────────────────────────
  const nextRoundNumber = roundCount + 1
  const { data: round, error: roundError } = await supabaseAdmin
    .from('custom_game_rounds')
    .insert({
      custom_game_id: gameId,
      round_number: nextRoundNumber,
      match_id: matchResult.matchId,
      played_at: matchResult.playedAt,
    })
    .select('id')
    .single()

  if (roundError || !round) {
    return NextResponse.json({ error: roundError?.message ?? '라운드 생성 실패' }, { status: 500 })
  }

  // ── 멤버/게스트 결과 분리 기록 ────────────────────────────────────
  const memberResults: { round_id: string; member_id: string; placement: number; points: number }[] = []
  const guestResults: { round_id: string; guest_id: string; placement: number; points: number }[] = []

  matchResult.placements
    .filter((p) => participantByPuuid.has(p.puuid))
    .forEach((p) => {
      const participant = participantByPuuid.get(p.puuid)!
      const base = { placement: p.placement, points: 9 - p.placement }
      if (participant.type === 'member') {
        memberResults.push({ round_id: round.id, member_id: participant.id, ...base })
      } else {
        guestResults.push({ round_id: round.id, guest_id: participant.id, ...base })
      }
    })

  const inserts = []
  if (memberResults.length > 0) {
    inserts.push(supabaseAdmin.from('custom_game_results').insert(memberResults))
  }
  if (guestResults.length > 0) {
    inserts.push(supabaseAdmin.from('custom_game_guest_results').insert(guestResults))
  }

  const results = await Promise.all(inserts)
  const insertError = results.find((r) => r.error)?.error
  if (insertError) {
    await supabaseAdmin.from('custom_game_rounds').delete().eq('id', round.id)
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, round_number: nextRoundNumber })
}
