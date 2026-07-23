import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage, canManageGame, getViewerMember } from '@/lib/customGames/authorize'
import {
  fetchGame,
  isCheckViolation,
  isMissingColumnError,
  migrationRequiredResponse,
  steamMigrationRequiredResponse,
} from '@/lib/customGames/game'
import { effectiveMemberCapacity, splitParticipants } from '@/lib/customGames/waitlist'
import {
  parseCapacity,
  parseGameKind,
  parseGameType,
  parseMaxRounds,
  parseScheduledAt,
  parseTitle,
  type GameKind,
} from '@/lib/customGames/constants'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const fetched = await fetchGame(id)
  if (!fetched.ok) return fetched.response
  const game = fetched.game

  const viewer = await getViewerMember()
  const viewerMemberId = viewer?.member?.id ?? null

  // ── 멤버 참가자 ──────────────────────────────────────────────────
  const { data: participantRows } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id, member_id, joined_at')
    .eq('custom_game_id', id)
    .order('joined_at')
    .order('id')

  const memberIds = (participantRows ?? []).map((p) => p.member_id)
  const lookupIds = [...new Set([...memberIds, ...(game.host_member_id ? [game.host_member_id] : [])])]

  const { data: memberRows } = await supabaseAdmin
    .from('members')
    .select('id, member_name, riot_game_name, riot_tagline, riot_puuid')
    .in('id', lookupIds.length > 0 ? lookupIds : ['__none__'])

  const memberMap = new Map((memberRows ?? []).map((m) => [m.id, m]))

  // ── 게스트 참가자 ─────────────────────────────────────────────────
  const { data: guestRows } = await supabaseAdmin
    .from('custom_game_guests')
    .select('id, display_name, riot_puuid')
    .eq('custom_game_id', id)
    .order('joined_at')

  const guests = guestRows ?? []

  // 확정/대기는 저장된 상태가 아니라 (joined_at, id) 순번에서 파생된다.
  const { confirmed, waitlist } = splitParticipants(
    participantRows ?? [],
    effectiveMemberCapacity(game.capacity, guests.length),
  )

  const toParticipant = (
    p: { id: string; member_id: string; joined_at: string },
    index: number,
    isConfirmed: boolean,
  ) => {
    const m = memberMap.get(p.member_id)
    return {
      id: p.id,
      member_id: p.member_id,
      member_name: m?.member_name ?? '알 수 없음',
      riot_game_name: m?.riot_game_name ?? '',
      riot_tagline: m?.riot_tagline ?? '',
      riot_puuid: m?.riot_puuid ?? null,
      joined_at: p.joined_at,
      position: index + 1,
      confirmed: isConfirmed,
      is_host: p.member_id === game.host_member_id,
    }
  }

  const confirmedParticipants = confirmed.map((p, i) => toParticipant(p, i, true))
  const waitlistParticipants = waitlist.map((p, i) => toParticipant(p, confirmed.length + i, false))
  // 기존 소비자를 위해 전체 목록도 그대로 유지한다.
  const participants = [...confirmedParticipants, ...waitlistParticipants]

  // ── 라운드 + 결과 ─────────────────────────────────────────────────
  const { data: roundRows } = await supabaseAdmin
    .from('custom_game_rounds')
    .select('id, round_number, match_id, played_at')
    .eq('custom_game_id', id)
    .order('round_number')

  const roundIds = (roundRows ?? []).map((r) => r.id)
  const safeRoundIds = roundIds.length > 0 ? roundIds : ['__none__']

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

  // ── 팀 배정 (TFT 팀전만 조회) ─────────────────────────────────────
  let teams: { round_number: number; team_index: number; member_id: string | null; guest_id: string | null }[] = []
  if (game.game_kind === 'tft' && game.game_type === 'team') {
    const { data: teamRows } = await supabaseAdmin
      .from('custom_game_teams')
      .select('round_number, team_index, member_id, guest_id')
      .eq('custom_game_id', id)
      .order('round_number')
      .order('team_index')
    teams = teamRows ?? []
  }

  const mine = viewerMemberId
    ? participants.find((p) => p.member_id === viewerMemberId) ?? null
    : null

  return NextResponse.json({
    game: {
      ...game,
      host_member_name: game.host_member_id
        ? memberMap.get(game.host_member_id)?.member_name ?? null
        : null,
    },
    participants,
    confirmed: confirmedParticipants,
    waitlist: waitlistParticipants,
    guests,
    rounds,
    teams,
    can_manage: canManageGame(game, viewerMemberId, viewer?.isAdmin ?? false),
    my_participation: mine
      ? { id: mine.id, position: mine.position, confirmed: mine.confirmed }
      : null,
    ...(fetched.migrationRequired ? { migration_required: true } : {}),
  })
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response
  const { game } = auth

  if (game.status === 'ended' || game.status === 'cancelled') {
    return NextResponse.json({ error: '종료된 내전은 수정할 수 없습니다' }, { status: 400 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  // ⚠ 화이트리스트. host_member_id / status / id 는 어떤 경우에도 여기서 바뀌지 않는다.
  const patch: {
    title?: string
    game_kind?: GameKind
    game_kind_label?: string | null
    steam_app_id?: number | null
    game_type?: string
    capacity?: number
    max_rounds?: number
    scheduled_at?: string
  } = {}

  if (body.title !== undefined) {
    const parsed = parseTitle(body.title)
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 })
    patch.title = parsed.value
  }

  const kind = parseGameKind(
    body.game_kind !== undefined ? body.game_kind : game.game_kind,
    body.game_kind_label !== undefined ? body.game_kind_label : game.game_kind_label,
    body.steam_app_id !== undefined ? body.steam_app_id : game.steam_app_id,
  )
  if (!kind.ok) return NextResponse.json({ error: kind.message }, { status: 400 })

  if (
    body.game_kind !== undefined ||
    body.game_kind_label !== undefined ||
    body.steam_app_id !== undefined
  ) {
    // 롤체 → 비롤체 전환 시, 이미 수집된 라운드/팀/게스트는 비롤체 화면에서
    // 렌더되지도 삭제되지도 않아 관리 불가 상태로 남는다. 기록이 있으면 전환을 막는다.
    if (game.game_kind === 'tft' && kind.value.game_kind !== 'tft') {
      const { count, error: roundCountError } = await supabaseAdmin
        .from('custom_game_results')
        .select('id', { count: 'exact', head: true })
        .eq('custom_game_id', id)

      if (roundCountError) {
        return NextResponse.json({ error: roundCountError.message }, { status: 500 })
      }
      if ((count ?? 0) > 0) {
        return NextResponse.json(
          { error: '이미 기록된 라운드가 있어 게임 종류를 바꿀 수 없습니다.' },
          { status: 400 },
        )
      }
    }

    patch.game_kind = kind.value.game_kind
    patch.game_kind_label = kind.value.game_kind_label
    // ⚠ kind가 steam이 아니게 되면 appid를 반드시 함께 비운다.
    //   앱이 빠뜨려도 DB CHECK(20260727 STEP 3)가 23514로 최종 차단한다.
    if (kind.value.steam_app_id !== game.steam_app_id) {
      patch.steam_app_id = kind.value.steam_app_id
    }
  }

  const gameType = parseGameType(
    kind.value.game_kind !== 'tft'
      ? 'solo'
      : body.game_type !== undefined
        ? body.game_type
        : game.game_type,
  )
  if (!gameType.ok) return NextResponse.json({ error: gameType.message }, { status: 400 })
  if (gameType.value !== game.game_type) patch.game_type = gameType.value

  const capacity = parseCapacity(
    body.capacity !== undefined ? body.capacity : game.capacity,
    kind.value.game_kind,
    gameType.value,
  )
  if (!capacity.ok) return NextResponse.json({ error: capacity.message }, { status: 400 })
  if (capacity.value !== game.capacity) patch.capacity = capacity.value

  if (body.max_rounds !== undefined) {
    const parsed = parseMaxRounds(body.max_rounds)
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 })
    patch.max_rounds = parsed.value
  }

  if (body.scheduled_date !== undefined || body.scheduled_time !== undefined) {
    const parsed = parseScheduledAt(body.scheduled_date, body.scheduled_time)
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: 400 })
    patch.scheduled_at = parsed.value
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true })
  }

  const { error } = await supabaseAdmin.from('custom_games').update(patch).eq('id', id)
  if (error) {
    if (patch.steam_app_id !== undefined || kind.value.game_kind === 'steam') {
      if (isMissingColumnError(error) || isCheckViolation(error)) {
        return steamMigrationRequiredResponse()
      }
    }
    if (isMissingColumnError(error)) return migrationRequiredResponse()
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response

  const { error } = await supabaseAdmin.from('custom_games').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
