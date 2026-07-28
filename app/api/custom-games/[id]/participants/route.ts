import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import { isUniqueViolation, rejectClosedGame } from '@/lib/customGames/game'
import { signupLimit } from '@/lib/customGames/constants'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * 관리자 OR 주최자가 승인 멤버를 직접 참가자로 추가한다.
 * ★ body.member_id 는 받되, 승인 여부(status='approved')는 서버가 members 조회로 재검증한다.
 *   대기열 status 컬럼은 만들지 않는다 — 정원 초과 시 (joined_at, id) 순번으로 자동 대기 편입된다.
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response
  const { game } = auth

  const closed = rejectClosedGame(game)
  if (closed) return closed

  const body = (await req.json().catch(() => null)) as { member_id?: unknown } | null
  const memberId = body && typeof body.member_id === 'string' ? body.member_id.trim() : ''
  if (!memberId) {
    return NextResponse.json({ error: '추가할 멤버를 선택하세요' }, { status: 400 })
  }

  // 승인 여부는 서버가 판정한다(미승인·미존재는 400).
  const { data: member, error: lookupError } = await supabaseAdmin
    .from('members')
    .select('id, status')
    .eq('id', memberId)
    .maybeSingle()

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })
  if (!member || member.status !== 'approved') {
    return NextResponse.json({ error: '승인된 멤버만 추가할 수 있습니다' }, { status: 400 })
  }

  const { count: signupCount } = await supabaseAdmin
    .from('custom_game_participants')
    .select('id', { count: 'exact', head: true })
    .eq('custom_game_id', id)

  if ((signupCount ?? 0) >= signupLimit(game.capacity)) {
    return NextResponse.json({ error: '신청 인원이 가득 찼습니다' }, { status: 400 })
  }

  // 중복 방지는 유니크 인덱스가 유일한 방어선 → 23505를 409로 매핑한다.
  const { error } = await supabaseAdmin
    .from('custom_game_participants')
    .insert({ custom_game_id: id, member_id: memberId })

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: '이미 참가 중인 멤버입니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
