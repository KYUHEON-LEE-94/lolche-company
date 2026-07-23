import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewerMember, canManageGame, isApprovedMember } from '@/lib/customGames/authorize'
import {
  GAME_COLUMNS,
  isMissingColumnError,
  migrationRequiredResponse,
  type GameRow,
} from '@/lib/customGames/game'
import { splitParticipants, effectiveMemberCapacity } from '@/lib/customGames/waitlist'
import {
  ACTIVE_STATUSES,
  MAX_ACTIVE_GAMES_PER_HOST,
  parseCapacity,
  parseGameKind,
  parseGameType,
  parseMaxRounds,
  parseScheduledAt,
  parseTitle,
} from '@/lib/customGames/constants'

export const dynamic = 'force-dynamic'

type ParticipantRow = { id: string; custom_game_id: string; member_id: string; joined_at: string }

export async function GET() {
  const viewer = await getViewerMember()
  const viewerMemberId = viewer?.member?.id ?? null

  const { data: gameRows, error } = await supabaseAdmin
    .from('custom_games')
    .select(GAME_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    // 마이그레이션 미적용 환경에서도 목록 화면이 죽지 않도록 구 컬럼만으로 degrade한다.
    if (isMissingColumnError(error)) {
      const { data: legacyRows, error: legacyError } = await supabaseAdmin
        .from('custom_games')
        .select('id, title, status, game_type, max_rounds, created_at, ended_at')
        .order('created_at', { ascending: false })

      if (legacyError) {
        return NextResponse.json({ error: legacyError.message }, { status: 500 })
      }
      return NextResponse.json({ games: legacyRows ?? [], migration_required: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const games = (gameRows ?? []) as unknown as GameRow[]
  const gameIds = games.map((g) => g.id)
  const safeGameIds = gameIds.length > 0 ? gameIds : ['__none__']

  const [{ data: participantRows }, { data: guestRows }] = await Promise.all([
    supabaseAdmin
      .from('custom_game_participants')
      .select('id, custom_game_id, member_id, joined_at')
      .in('custom_game_id', safeGameIds),
    supabaseAdmin
      .from('custom_game_guests')
      .select('id, custom_game_id')
      .in('custom_game_id', safeGameIds),
  ])

  const participantsByGame = new Map<string, ParticipantRow[]>()
  ;(participantRows ?? []).forEach((p) => {
    const arr = participantsByGame.get(p.custom_game_id) ?? []
    arr.push(p)
    participantsByGame.set(p.custom_game_id, arr)
  })

  const guestCountByGame = new Map<string, number>()
  ;(guestRows ?? []).forEach((g) => {
    guestCountByGame.set(g.custom_game_id, (guestCountByGame.get(g.custom_game_id) ?? 0) + 1)
  })

  const hostIds = [...new Set(games.map((g) => g.host_member_id).filter((v): v is string => !!v))]
  const { data: hostRows } = await supabaseAdmin
    .from('members')
    .select('id, member_name')
    .in('id', hostIds.length > 0 ? hostIds : ['__none__'])
  const hostNameById = new Map((hostRows ?? []).map((m) => [m.id, m.member_name]))

  const enriched = games.map((game) => {
    const rows = participantsByGame.get(game.id) ?? []
    const guestCount = guestCountByGame.get(game.id) ?? 0
    const { confirmed, waitlist } = splitParticipants(
      rows,
      effectiveMemberCapacity(game.capacity, guestCount),
    )

    const ordered = [...confirmed, ...waitlist]
    const myIndex = viewerMemberId
      ? ordered.findIndex((p) => p.member_id === viewerMemberId)
      : -1

    return {
      ...game,
      host_member_name: game.host_member_id
        ? hostNameById.get(game.host_member_id) ?? '알 수 없음'
        : null,
      guest_count: guestCount,
      confirmed_count: confirmed.length,
      waitlist_count: waitlist.length,
      can_manage: canManageGame(game, viewerMemberId, viewer?.isAdmin ?? false),
      my_participation:
        myIndex >= 0 ? { position: myIndex + 1, confirmed: myIndex < confirmed.length } : null,
    }
  })

  return NextResponse.json({ games: enriched })
}

export async function POST(req: Request) {
  const viewer = await getViewerMember()
  if (!viewer) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  if (!isApprovedMember(viewer) || !viewer.member) {
    return NextResponse.json({ error: '승인된 멤버만 내전을 만들 수 있습니다' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다' }, { status: 400 })
  }

  const title = parseTitle(body.title)
  if (!title.ok) return NextResponse.json({ error: title.message }, { status: 400 })

  const kind = parseGameKind(body.game_kind ?? 'tft', body.game_kind_label)
  if (!kind.ok) return NextResponse.json({ error: kind.message }, { status: 400 })

  // 팀전·라운드 기록은 TFT 매치 조회를 전제하므로 다른 종류에서는 방식을 solo로 고정한다.
  const gameType = parseGameType(kind.value.game_kind === 'tft' ? body.game_type : 'solo')
  if (!gameType.ok) return NextResponse.json({ error: gameType.message }, { status: 400 })

  const capacity = parseCapacity(body.capacity, kind.value.game_kind, gameType.value)
  if (!capacity.ok) return NextResponse.json({ error: capacity.message }, { status: 400 })

  const maxRounds = parseMaxRounds(body.max_rounds)
  if (!maxRounds.ok) return NextResponse.json({ error: maxRounds.message }, { status: 400 })

  const scheduledAt = parseScheduledAt(body.scheduled_date, body.scheduled_time)
  if (!scheduledAt.ok) return NextResponse.json({ error: scheduledAt.message }, { status: 400 })

  const { count: activeCount, error: countError } = await supabaseAdmin
    .from('custom_games')
    .select('id', { count: 'exact', head: true })
    .eq('host_member_id', viewer.member.id)
    .in('status', [...ACTIVE_STATUSES])

  if (countError) {
    if (isMissingColumnError(countError)) return migrationRequiredResponse()
    return NextResponse.json({ error: countError.message }, { status: 500 })
  }
  if ((activeCount ?? 0) >= MAX_ACTIVE_GAMES_PER_HOST) {
    return NextResponse.json(
      { error: `진행 중인 내전은 최대 ${MAX_ACTIVE_GAMES_PER_HOST}개까지만 만들 수 있습니다` },
      { status: 400 },
    )
  }

  const { data: game, error: gameError } = await supabaseAdmin
    .from('custom_games')
    .insert({
      title: title.value,
      status: 'recruiting',
      game_kind: kind.value.game_kind,
      game_kind_label: kind.value.game_kind_label,
      game_type: gameType.value,
      capacity: capacity.value,
      max_rounds: maxRounds.value,
      scheduled_at: scheduledAt.value,
      host_member_id: viewer.member.id,
    })
    .select('id')
    .single()

  if (gameError || !game) {
    if (isMissingColumnError(gameError)) return migrationRequiredResponse()
    return NextResponse.json({ error: gameError?.message ?? '생성 실패' }, { status: 500 })
  }

  // 주최자는 항상 첫 번째 참가자다 (joined_at 순번 1번).
  const { error: participantError } = await supabaseAdmin
    .from('custom_game_participants')
    .insert({ custom_game_id: game.id, member_id: viewer.member.id })

  if (participantError) {
    await supabaseAdmin.from('custom_games').delete().eq('id', game.id)
    return NextResponse.json({ error: participantError.message }, { status: 500 })
  }

  return NextResponse.json({ id: game.id })
}
