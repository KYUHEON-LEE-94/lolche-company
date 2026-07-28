import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import {
  isCheckViolation,
  isMissingColumnError,
  lolMigrationRequiredResponse,
  rejectClosedGame,
  rejectNonLolGame,
} from '@/lib/customGames/game'
import { effectiveMemberCapacity, splitParticipants } from '@/lib/customGames/waitlist'
import { LOL_CAPACITY, LOL_POSITIONS, isLolPosition } from '@/lib/customGames/constants'

export const dynamic = 'force-dynamic'

// 롤은 라운드 개념이 없어 팀 배정을 항상 round_number=1 로 고정한다.
const LOL_ROUND = 1
const TEAM_SIZE = LOL_CAPACITY / 2 // 5:5

type Ctx = { params: Promise<{ id: string }> }

type LolAssignment = { team_index: number; member_id?: string; position?: string | null }

/**
 * ★ 롤 전용 팀/포지션 배정. rejectNonLolGame() 으로만 열린다.
 *   기존 TFT teams/route.ts(4팀×2·라운드) 로직과 완전히 분리된 경로다.
 *   게스트는 롤에 도입하지 않는다(member 만).
 */

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const withPosition = await supabaseAdmin
    .from('custom_game_teams')
    .select('team_index, member_id, position')
    .eq('custom_game_id', id)
    .order('team_index')

  if (withPosition.error) {
    // position 컬럼(20260731) 미적용 → position 없이 재조회해 degrade.
    if (isMissingColumnError(withPosition.error)) {
      const { data: legacy, error } = await supabaseAdmin
        .from('custom_game_teams')
        .select('team_index, member_id')
        .eq('custom_game_id', id)
        .order('team_index')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ teams: (legacy ?? []).map((t) => ({ ...t, position: null })) })
    }
    return NextResponse.json({ error: withPosition.error.message }, { status: 500 })
  }

  return NextResponse.json({ teams: withPosition.data ?? [] })
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params

  const auth = await authorizeGameManage(gameId)
  if (!auth.ok) return auth.response
  const { game } = auth

  const notLol = rejectNonLolGame(game)
  if (notLol) return notLol
  const closed = rejectClosedGame(game)
  if (closed) return closed

  const isRift = game.lol_mode === 'rift'

  const body = (await req.json().catch(() => null)) as {
    assignments?: LolAssignment[]
    random?: boolean
  } | null

  if (!body) {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  // ── 확정 참가자(상위 10명) 조회 ──────────────────────────────────
  const { data: memberParts } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id, member_id, joined_at')
    .eq('custom_game_id', gameId)

  const { confirmed } = splitParticipants(
    memberParts ?? [],
    effectiveMemberCapacity(game.capacity, 0),
  )
  const confirmedIds = new Set(confirmed.map((p) => p.member_id))

  let finalAssignments: LolAssignment[]

  if (body.random) {
    // ── 랜덤 배정 ─────────────────────────────────────────────────
    if (confirmed.length !== LOL_CAPACITY) {
      return NextResponse.json(
        { error: `랜덤 배정은 확정 참가자 ${LOL_CAPACITY}명이어야 가능합니다` },
        { status: 400 },
      )
    }
    const shuffled = [...confirmed].sort(() => Math.random() - 0.5)
    finalAssignments = shuffled.map((p, i) => {
      const teamIndex = i < TEAM_SIZE ? 1 : 2
      const slot = i % TEAM_SIZE
      return {
        team_index: teamIndex,
        member_id: p.member_id,
        position: isRift ? LOL_POSITIONS[slot] : null,
      }
    })
  } else {
    // ── 수동 배정 검증 ────────────────────────────────────────────
    if (!Array.isArray(body.assignments) || body.assignments.length === 0) {
      return NextResponse.json({ error: '팀 배정 정보가 없습니다' }, { status: 400 })
    }
    finalAssignments = body.assignments

    const seenMembers = new Set<string>()
    const teamCounts: Record<number, number> = { 1: 0, 2: 0 }
    const teamPositions: Record<number, Set<string>> = { 1: new Set(), 2: new Set() }

    for (const a of finalAssignments) {
      if (!a.member_id || typeof a.member_id !== 'string') {
        return NextResponse.json({ error: '잘못된 배정 형식입니다' }, { status: 400 })
      }
      if (a.team_index !== 1 && a.team_index !== 2) {
        return NextResponse.json({ error: '팀 번호는 1 또는 2여야 합니다' }, { status: 400 })
      }
      if (!confirmedIds.has(a.member_id)) {
        return NextResponse.json(
          { error: '확정 참가자가 아닌 대상이 배정에 포함되어 있습니다' },
          { status: 400 },
        )
      }
      if (seenMembers.has(a.member_id)) {
        return NextResponse.json({ error: '같은 참가자가 중복 배정되었습니다' }, { status: 400 })
      }
      seenMembers.add(a.member_id)

      teamCounts[a.team_index]++
      if (teamCounts[a.team_index] > TEAM_SIZE) {
        return NextResponse.json({ error: `한 팀에는 최대 ${TEAM_SIZE}명까지 배정할 수 있습니다` }, { status: 400 })
      }

      if (isRift) {
        if (!isLolPosition(a.position)) {
          return NextResponse.json({ error: '협곡은 포지션을 지정해야 합니다' }, { status: 400 })
        }
        if (teamPositions[a.team_index].has(a.position)) {
          return NextResponse.json({ error: '같은 팀에 포지션이 중복되었습니다' }, { status: 400 })
        }
        teamPositions[a.team_index].add(a.position)
      } else if (a.position != null) {
        return NextResponse.json({ error: '증바람은 포지션을 지정할 수 없습니다' }, { status: 400 })
      }
    }
  }

  // ── 저장 (기존 배정 전체 삭제 후 재삽입) ─────────────────────────
  await supabaseAdmin.from('custom_game_teams').delete().eq('custom_game_id', gameId)

  const inserts = finalAssignments.map((a) => ({
    custom_game_id: gameId,
    round_number: LOL_ROUND,
    team_index: a.team_index,
    member_id: a.member_id ?? null,
    guest_id: null,
    position: isRift ? a.position ?? null : null,
  }))

  const { error: insertError } = await supabaseAdmin.from('custom_game_teams').insert(inserts)
  if (insertError) {
    // position 컬럼·CHECK(20260731)가 선행되어야 한다. 위반은 500이 아니라 안내다.
    if (isMissingColumnError(insertError) || isCheckViolation(insertError)) {
      return lolMigrationRequiredResponse()
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, assignments: finalAssignments })
}
