import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewerMember, isApprovedMember } from '@/lib/customGames/authorize'
import { fetchGame, isUniqueViolation, type GameRow } from '@/lib/customGames/game'
import { effectiveMemberCapacity, splitParticipants } from '@/lib/customGames/waitlist'
import { JOINABLE_STATUSES, signupLimit, type GameStatus } from '@/lib/customGames/constants'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function isJoinable(game: GameRow): boolean {
  return JOINABLE_STATUSES.includes(game.status as GameStatus)
}

/** 확정/대기는 저장하지 않고 (joined_at, id) 순번에서 파생한다. */
async function derivePosition(game: GameRow, memberId: string) {
  const [{ data: rows }, { count: guestCount }] = await Promise.all([
    supabaseAdmin
      .from('custom_game_participants')
      .select('id, member_id, joined_at')
      .eq('custom_game_id', game.id),
    supabaseAdmin
      .from('custom_game_guests')
      .select('id', { count: 'exact', head: true })
      .eq('custom_game_id', game.id),
  ])

  const { confirmed, waitlist } = splitParticipants(
    rows ?? [],
    effectiveMemberCapacity(game.capacity, guestCount ?? 0),
  )
  const ordered = [...confirmed, ...waitlist]
  const index = ordered.findIndex((p) => p.member_id === memberId)

  return {
    position: index >= 0 ? index + 1 : null,
    confirmed: index >= 0 && index < confirmed.length,
    confirmed_count: confirmed.length,
    waitlist_count: waitlist.length,
  }
}

export async function POST(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const viewer = await getViewerMember()
  if (!viewer) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (!isApprovedMember(viewer) || !viewer.member) {
    return NextResponse.json({ error: '승인된 멤버만 참가할 수 있습니다' }, { status: 403 })
  }

  const fetched = await fetchGame(id)
  if (!fetched.ok) return fetched.response
  const game = fetched.game

  if (!isJoinable(game)) {
    return NextResponse.json({ error: '모집 중인 내전이 아닙니다' }, { status: 400 })
  }

  const { count: signupCount } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id', { count: 'exact', head: true })
    .eq('custom_game_id', id)

  if ((signupCount ?? 0) >= signupLimit(game.capacity)) {
    return NextResponse.json({ error: '대기 인원이 가득 찼습니다' }, { status: 400 })
  }

  // ⚠ body의 member 식별자는 읽지 않는다. 세션에서 해석한 멤버만 등록한다.
  //   중복 신청 차단은 유니크 인덱스가 유일한 방어선이므로 23505를 409로 매핑한다.
  const { error } = await supabaseAdmin
    .from('custom_game_participants')
    .insert({ custom_game_id: id, member_id: viewer.member.id })

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: '이미 신청한 내전입니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ...(await derivePosition(game, viewer.member.id)) })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const viewer = await getViewerMember()
  if (!viewer) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (!viewer.member) {
    return NextResponse.json({ error: '멤버 정보를 찾을 수 없습니다' }, { status: 403 })
  }

  const fetched = await fetchGame(id)
  if (!fetched.ok) return fetched.response
  const game = fetched.game

  if (!isJoinable(game)) {
    return NextResponse.json({ error: '모집 중인 내전이 아닙니다' }, { status: 400 })
  }
  if (game.host_member_id !== null && game.host_member_id === viewer.member.id) {
    return NextResponse.json(
      { error: '주최자는 참가를 취소할 수 없습니다. 내전을 삭제하세요.' },
      { status: 400 },
    )
  }

  // 취소는 DELETE 1건이 전부다 — 승격 로직이 없으므로 승격 경합도 없다.
  const { data: deleted, error } = await supabaseAdmin
    .from('custom_game_participants')
    .delete()
    .eq('custom_game_id', id)
    .eq('member_id', viewer.member.id)
    .select('id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: '참가 신청 내역이 없습니다' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
