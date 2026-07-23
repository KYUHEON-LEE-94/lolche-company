import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { findCommonMatch } from '@/lib/tournament/findCommonMatch'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import { rejectClosedGame, rejectNonTftGame } from '@/lib/customGames/game'
import { effectiveMemberCapacity, splitParticipants } from '@/lib/customGames/waitlist'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params

  const auth = await authorizeGameManage(gameId)
  if (!auth.ok) return auth.response
  const { game } = auth

  // ⚠ findCommonMatch()는 Riot TFT 매치 API를 호출한다. 비-TFT 내전에서 호출되면
  //   엉뚱한 매치가 기록되므로 반드시 여기서 차단한다(UI 숨김만으로는 부족).
  const notTft = rejectNonTftGame(game)
  if (notTft) return notTft
  const closed = rejectClosedGame(game)
  if (closed) return closed

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

  // ── 게스트 PUUID 조회 ─────────────────────────────────────────────
  const { data: guestRows } = await supabaseAdmin
    .from('custom_game_guests')
    .select('id, riot_puuid')
    .eq('custom_game_id', gameId)

  // ── 확정 참가자 PUUID 조회 (대기자는 매치 탐색 대상이 아니다) ────
  const { data: participantRows } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id, member_id, joined_at')
    .eq('custom_game_id', gameId)

  const { confirmed } = splitParticipants(
    participantRows ?? [],
    effectiveMemberCapacity(game.capacity, (guestRows ?? []).length),
  )
  const memberIds = confirmed.map((p) => p.member_id)

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

  const nextRoundNumber = roundCount + 1

  // ── 팀전: 팀 배정 조회 ────────────────────────────────────────────
  let teamByParticipant: Map<string, number> | null = null
  if (game.game_type === 'team') {
    const { data: teamRows } = await supabaseAdmin
      .from('custom_game_teams')
      .select('team_index, member_id, guest_id')
      .eq('custom_game_id', gameId)
      .eq('round_number', nextRoundNumber)

    if (!teamRows || teamRows.length === 0) {
      return NextResponse.json(
        { error: '팀을 먼저 배정해주세요' },
        { status: 400 },
      )
    }

    teamByParticipant = new Map<string, number>()
    teamRows.forEach((t) => {
      const id = t.member_id ?? t.guest_id!
      teamByParticipant!.set(id, t.team_index)
    })
  }

  // ── 라운드 생성 ───────────────────────────────────────────────────
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

  // 팀전: 팀별 합산 점수 계산
  const teamScores = new Map<number, number>()
  if (teamByParticipant) {
    matchResult.placements
      .filter((p) => participantByPuuid.has(p.puuid))
      .forEach((p) => {
        const participant = participantByPuuid.get(p.puuid)!
        const teamIdx = teamByParticipant!.get(participant.id)
        if (teamIdx !== undefined) {
          teamScores.set(teamIdx, (teamScores.get(teamIdx) ?? 0) + (9 - p.placement))
        }
      })
  }

  matchResult.placements
    .filter((p) => participantByPuuid.has(p.puuid))
    .forEach((p) => {
      const participant = participantByPuuid.get(p.puuid)!
      let points: number
      if (teamByParticipant) {
        const teamIdx = teamByParticipant.get(participant.id)
        points = teamIdx !== undefined ? (teamScores.get(teamIdx) ?? 0) : 0
      } else {
        points = 9 - p.placement
      }
      const base = { placement: p.placement, points }
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
