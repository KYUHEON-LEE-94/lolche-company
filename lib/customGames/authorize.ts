import 'server-only'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/route'
import { requireAdmin } from '@/app/lib/isAdmin'

/**
 * 내전 쓰기 작업 권한 가드 (Phase B1).
 *
 * 지금까지 이 엔드포인트들은 로그인만 확인했기 때문에, 로그인한 아무나
 * 남의 내전을 삭제·종료·강퇴·라운드 조작할 수 있었다. 임시로 관리자 전용으로 조인다.
 *
 * ⚠ 최종 형태가 아니다. Phase B2에서 `custom_games.host_member_id`가 추가되면
 *   `canManageGame(game, viewerMemberId, isAdmin)` — 주최자 본인 + 관리자 — 로 완화된다.
 *
 * 미들웨어가 `/api/*`를 통과시키므로 리다이렉트가 아닌 JSON으로 응답해야 한다.
 * 권한이 있으면 null, 없으면 그대로 반환할 응답을 돌려준다.
 */
export async function requireGameManager(): Promise<NextResponse | null> {
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  }

  const { ok } = await requireAdmin()
  if (!ok) {
    return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })
  }

  return null
}
