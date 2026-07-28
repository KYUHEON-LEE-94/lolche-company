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

type LolAssignment = {
  team_index: number
  member_id?: string
  guest_name?: string | null
  position?: string | null
}

const GUEST_NAME_MAX = 20

/**
 * ★ 롤 전용 팀/포지션 배정. rejectNonLolGame() 으로만 열린다.
 *   기존 TFT teams/route.ts(4팀×2·라운드) 로직과 완전히 분리된 경로다.
 *   슬롯은 확정 멤버(member_id) 또는 외부인 라벨(guest_name) 중 하나로 채운다.
 *   ★ guest_name 은 자유 텍스트 라벨이며 TFT 게스트(guest_id=puuid)와 무관하다 —
 *     롤 INSERT 는 guest_id 를 항상 null 로 둔다.
 */

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const withPosition = await supabaseAdmin
    .from('custom_game_teams')
    .select('team_index, member_id, guest_name, position')
    .eq('custom_game_id', id)
    .order('team_index')

  if (withPosition.error) {
    // position/guest_name 컬럼(20260731/20260732) 미적용 → 없이 재조회해 degrade.
    if (isMissingColumnError(withPosition.error)) {
      const { data: legacy, error } = await supabaseAdmin
        .from('custom_game_teams')
        .select('team_index, member_id, guest_id')
        .eq('custom_game_id', id)
        .order('team_index')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({
        teams: (legacy ?? []).map((t) => ({
          team_index: t.team_index,
          member_id: t.member_id,
          position: null,
          guest_name: null,
        })),
      })
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
    // 정규화: guest_name 은 trim 후 빈문자면 없는 것으로 취급.
    finalAssignments = body.assignments.map((a) => ({
      ...a,
      guest_name: typeof a.guest_name === 'string' ? a.guest_name.trim() : null,
    }))

    const seenMembers = new Set<string>()
    // 외부인 라벨은 슬롯 라벨이라 정원과 무관하다. 팀 전체(양팀) trim·소문자 기준 중복만 막는다.
    const seenGuestNames = new Set<string>()
    const teamCounts: Record<number, number> = { 1: 0, 2: 0 }
    const teamPositions: Record<number, Set<string>> = { 1: new Set(), 2: new Set() }

    for (const a of finalAssignments) {
      if (a.team_index !== 1 && a.team_index !== 2) {
        return NextResponse.json({ error: '팀 번호는 1 또는 2여야 합니다' }, { status: 400 })
      }

      const hasMember = typeof a.member_id === 'string' && a.member_id.length > 0
      const guestName = typeof a.guest_name === 'string' ? a.guest_name : ''
      const hasGuest = guestName.length > 0

      // ★ 슬롯 정체성: 멤버 또는 외부인 중 정확히 하나. (앱 검증 + DB identity_chk 이중 방어)
      if (hasMember === hasGuest) {
        return NextResponse.json(
          { error: '슬롯마다 멤버 또는 외부인 이름 중 하나만 지정할 수 있습니다' },
          { status: 400 },
        )
      }

      if (hasMember) {
        const memberId = a.member_id as string
        if (!confirmedIds.has(memberId)) {
          return NextResponse.json(
            { error: '확정 참가자가 아닌 대상이 배정에 포함되어 있습니다' },
            { status: 400 },
          )
        }
        if (seenMembers.has(memberId)) {
          return NextResponse.json({ error: '같은 참가자가 중복 배정되었습니다' }, { status: 400 })
        }
        seenMembers.add(memberId)
      } else {
        // 외부인은 정원(확정 10명) 계산에 넣지 않는다 — confirmedIds 검증 제외.
        if (guestName.length > GUEST_NAME_MAX) {
          return NextResponse.json(
            { error: `외부인 이름은 ${GUEST_NAME_MAX}자 이하여야 합니다` },
            { status: 400 },
          )
        }
        const key = guestName.toLowerCase()
        if (seenGuestNames.has(key)) {
          return NextResponse.json({ error: '같은 외부인 이름이 중복되었습니다' }, { status: 400 })
        }
        seenGuestNames.add(key)
      }

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

  const inserts = finalAssignments.map((a) => {
    const guestName = typeof a.guest_name === 'string' ? a.guest_name.trim() : ''
    const hasMember = typeof a.member_id === 'string' && a.member_id.length > 0
    return {
      custom_game_id: gameId,
      round_number: LOL_ROUND,
      team_index: a.team_index,
      member_id: hasMember ? (a.member_id as string) : null,
      // ★ 외부인은 guest_name(라벨)에만 저장. guest_id(TFT puuid)는 롤에서 항상 null.
      guest_name: hasMember ? null : guestName || null,
      guest_id: null,
      position: isRift ? a.position ?? null : null,
    }
  })

  const { error: insertError } = await supabaseAdmin.from('custom_game_teams').insert(inserts)
  if (insertError) {
    // position/guest_name 컬럼·CHECK(20260731/20260732)가 선행되어야 한다. 위반은 500이 아니라 안내다.
    if (isMissingColumnError(insertError) || isCheckViolation(insertError)) {
      return lolMigrationRequiredResponse()
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, assignments: finalAssignments })
}
