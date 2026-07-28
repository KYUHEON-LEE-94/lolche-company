import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { authorizeGameManage } from '@/lib/customGames/authorize'
import { isUniqueViolation, rejectClosedGame } from '@/lib/customGames/game'
import { signupLimit } from '@/lib/customGames/constants'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/**
 * 관리자 OR 주최자가 승인 멤버를 직접 참가자로 추가한다. 단건(member_id) 또는 다건(member_ids[]).
 * ★ 승인 여부(status='approved')는 서버가 members 조회로 재검증한다(body 값 불신).
 *   대기열 status 컬럼은 만들지 않는다 — 정원 초과 시 (joined_at, id) 순번으로 자동 대기 편입된다.
 *   이미 참가 중인 멤버는 오류가 아니라 조용히 건너뛴다(added/skipped 로 보고).
 */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params

  const auth = await authorizeGameManage(id)
  if (!auth.ok) return auth.response
  const { game } = auth

  const closed = rejectClosedGame(game)
  if (closed) return closed

  const body = (await req.json().catch(() => null)) as
    | { member_id?: unknown; member_ids?: unknown }
    | null

  // 단건/다건 입력을 하나의 배열로 정규화한다(공백 제거 + 중복 제거).
  const rawIds: unknown[] =
    body && Array.isArray(body.member_ids)
      ? body.member_ids
      : body && typeof body.member_id === 'string'
        ? [body.member_id]
        : []
  const ids = [
    ...new Set(
      rawIds
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  ]
  if (ids.length === 0) {
    return NextResponse.json({ error: '추가할 멤버를 선택하세요' }, { status: 400 })
  }

  // 승인 여부는 서버가 판정한다(미승인·미존재는 제외).
  const { data: members, error: lookupError } = await supabaseAdmin
    .from('members')
    .select('id, status')
    .in('id', ids)

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 })

  const approvedIds = (members ?? []).filter((m) => m.status === 'approved').map((m) => m.id)
  if (approvedIds.length === 0) {
    return NextResponse.json({ error: '승인된 멤버만 추가할 수 있습니다' }, { status: 400 })
  }

  // 이미 참가 중인 멤버는 조용히 건너뛴다(중복 추가는 오류가 아니다).
  const { data: existing } = await supabaseAdmin
    .from('custom_game_participants')
    .select('member_id')
    .eq('custom_game_id', id)
  const existingIds = new Set((existing ?? []).map((p) => p.member_id))
  const toInsert = approvedIds.filter((mid) => !existingIds.has(mid))
  const skipped = approvedIds.length - toInsert.length

  if (toInsert.length === 0) {
    return NextResponse.json({ ok: true, added: 0, skipped })
  }

  // 신청 상한 검사 — 추가 후 총 신청 인원이 상한을 넘지 않아야 한다.
  const limit = signupLimit(game.capacity)
  if (existingIds.size + toInsert.length > limit) {
    const remaining = Math.max(0, limit - existingIds.size)
    return NextResponse.json(
      { error: `신청 상한(${limit}명)을 초과합니다. 최대 ${remaining}명까지 추가할 수 있습니다` },
      { status: 400 },
    )
  }

  // 중복 방지는 유니크 인덱스가 유일한 방어선 → 동시요청 23505를 409로 매핑한다.
  const { error } = await supabaseAdmin
    .from('custom_game_participants')
    .insert(toInsert.map((mid) => ({ custom_game_id: id, member_id: mid })))

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json({ error: '이미 참가 중인 멤버입니다' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, added: toInsert.length, skipped })
}
