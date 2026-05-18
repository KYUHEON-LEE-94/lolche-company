import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const { data, error } = await supabaseAdmin
    .from('custom_game_teams')
    .select('round_number, team_index, member_id, guest_id')
    .eq('custom_game_id', id)
    .order('round_number')
    .order('team_index')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ teams: data ?? [] })
}

export async function POST(req: Request, ctx: Ctx) {
  const { id: gameId } = await ctx.params
  const body = (await req.json()) as {
    round_number: number
    assignments?: { team_index: number; member_id?: string; guest_id?: string }[]
    random?: boolean
  }
  const { round_number, random = false } = body

  const { data: game } = await supabaseAdmin
    .from('custom_games')
    .select('id, status, game_type')
    .eq('id', gameId)
    .single()

  if (!game) return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
  if (game.status === 'ended') return NextResponse.json({ error: '종료된 내전입니다' }, { status: 400 })
  if (game.game_type !== 'team') return NextResponse.json({ error: '팀전이 아닙니다' }, { status: 400 })

  const { data: existingRounds } = await supabaseAdmin
    .from('custom_game_rounds')
    .select('round_number')
    .eq('custom_game_id', gameId)

  const nextRound = (existingRounds?.length ?? 0) + 1
  if (round_number !== nextRound) {
    return NextResponse.json(
      { error: `현재 배정 가능한 라운드는 ${nextRound}라운드입니다` },
      { status: 400 },
    )
  }

  // ── 참가자 목록 조회 ─────────────────────────────────────────────
  const [{ data: memberParts }, { data: guestParts }] = await Promise.all([
    supabaseAdmin.from('custom_game_participants').select('member_id').eq('custom_game_id', gameId),
    supabaseAdmin.from('custom_game_guests').select('id').eq('custom_game_id', gameId),
  ])

  const allParticipants: { type: 'member' | 'guest'; id: string }[] = [
    ...(memberParts ?? []).map((p) => ({ type: 'member' as const, id: p.member_id })),
    ...(guestParts ?? []).map((g) => ({ type: 'guest' as const, id: g.id })),
  ]

  if (allParticipants.length !== 8) {
    return NextResponse.json(
      { error: '팀전은 참가자 8명이어야 팀 배정이 가능합니다' },
      { status: 400 },
    )
  }

  // ── 이전 라운드 팀 조합 수집 ──────────────────────────────────────
  const { data: prevTeams } = await supabaseAdmin
    .from('custom_game_teams')
    .select('round_number, team_index, member_id, guest_id')
    .eq('custom_game_id', gameId)
    .lt('round_number', round_number)

  const previousPairs = new Set<string>()
  if (prevTeams) {
    const byKey = new Map<string, string[]>()
    prevTeams.forEach((t) => {
      const k = `${t.round_number}-${t.team_index}`
      const pid = t.member_id ?? t.guest_id!
      const arr = byKey.get(k) ?? []
      arr.push(pid)
      byKey.set(k, arr)
    })
    byKey.forEach((members) => {
      if (members.length === 2) {
        const [a, b] = [...members].sort()
        previousPairs.add(`${a}|${b}`)
      }
    })
  }

  let finalAssignments: { team_index: number; member_id?: string; guest_id?: string }[]

  if (random) {
    // ── 랜덤 팀 배정 ──────────────────────────────────────────────
    const ids = allParticipants.map((p) => p.id)
    let generated: string[][] | null = null

    for (let attempt = 0; attempt < 300; attempt++) {
      const shuffled = [...ids].sort(() => Math.random() - 0.5)
      const teams = [
        [shuffled[0], shuffled[1]],
        [shuffled[2], shuffled[3]],
        [shuffled[4], shuffled[5]],
        [shuffled[6], shuffled[7]],
      ]

      const valid = teams.every(([a, b]) => {
        const key = [a, b].sort().join('|')
        return !previousPairs.has(key)
      })

      if (valid) {
        generated = teams
        break
      }
    }

    if (!generated) {
      return NextResponse.json(
        { error: '이전 라운드와 겹치지 않는 팀 배정을 찾을 수 없습니다. 수동으로 배정해주세요.' },
        { status: 400 },
      )
    }

    finalAssignments = generated.flatMap((team, teamIdx) =>
      team.map((id) => {
        const participant = allParticipants.find((p) => p.id === id)!
        return participant.type === 'member'
          ? { team_index: teamIdx + 1, member_id: id }
          : { team_index: teamIdx + 1, guest_id: id }
      }),
    )
  } else {
    // ── 수동 팀 배정 검증 ─────────────────────────────────────────
    if (!body.assignments?.length) {
      return NextResponse.json({ error: '팀 배정 정보가 없습니다' }, { status: 400 })
    }
    finalAssignments = body.assignments

    if (finalAssignments.length !== 8) {
      return NextResponse.json({ error: '참가자 8명 전원을 팀에 배정해야 합니다' }, { status: 400 })
    }

    for (const a of finalAssignments) {
      if ((!a.member_id && !a.guest_id) || (a.member_id && a.guest_id)) {
        return NextResponse.json({ error: '잘못된 배정 형식입니다' }, { status: 400 })
      }
      if (a.team_index < 1 || a.team_index > 4) {
        return NextResponse.json({ error: '팀 번호는 1~4여야 합니다' }, { status: 400 })
      }
    }

    // 각 팀에 정확히 2명인지 확인
    const teamCounts = [0, 0, 0, 0]
    finalAssignments.forEach((a) => { teamCounts[a.team_index - 1]++ })
    if (teamCounts.some((c) => c !== 2)) {
      return NextResponse.json({ error: '각 팀에는 정확히 2명씩 배정해야 합니다' }, { status: 400 })
    }

    // 팀원 중복 금지 검증
    const byTeam = new Map<number, string[]>()
    finalAssignments.forEach((a) => {
      const pid = a.member_id ?? a.guest_id!
      const arr = byTeam.get(a.team_index) ?? []
      arr.push(pid)
      byTeam.set(a.team_index, arr)
    })
    for (const [, members] of byTeam) {
      if (members.length === 2) {
        const [a, b] = [...members].sort()
        if (previousPairs.has(`${a}|${b}`)) {
          return NextResponse.json(
            { error: '이전 라운드에서 같은 팀이었던 조합이 포함되어 있습니다' },
            { status: 400 },
          )
        }
      }
    }
  }

  // ── 저장 (해당 라운드 기존 배정 삭제 후 재삽입) ─────────────────
  await supabaseAdmin
    .from('custom_game_teams')
    .delete()
    .eq('custom_game_id', gameId)
    .eq('round_number', round_number)

  const inserts = finalAssignments.map((a) => ({
    custom_game_id: gameId,
    round_number,
    team_index: a.team_index,
    member_id: a.member_id ?? null,
    guest_id: a.guest_id ?? null,
  }))

  const { error: insertError } = await supabaseAdmin.from('custom_game_teams').insert(inserts)
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ ok: true, assignments: finalAssignments })
}
