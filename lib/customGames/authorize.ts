import 'server-only'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/supabase/route'
import { requireAdmin } from '@/app/lib/isAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDiscordId } from '@/lib/auth/discord'
import { fetchGame, type GameRow } from './game'

export type ViewerMember = {
  id: string
  member_name: string
  status: string | null
}

export type Viewer = {
  userId: string
  member: ViewerMember | null
  isAdmin: boolean
}

/**
 * 세션 → members 해석 공용 함수.
 *
 * ⚠ 요청 body에 실린 어떤 member 식별자도 신뢰하지 않는다. 주최자·참가자 판정은
 *   전적으로 이 함수가 돌려주는 값으로만 한다.
 */
export async function getViewerMember(): Promise<Viewer | null> {
  const user = await getCurrentUser()
  if (!user) return null

  const columns = 'id, member_name, status'

  const { data: byUserId } = await supabaseAdmin
    .from('members')
    .select(columns)
    .eq('user_id', user.id)
    .maybeSingle()

  let member: ViewerMember | null = byUserId ?? null

  if (!member) {
    // user_id 미연결 계정 대비 읽기 전용 fallback (백필은 auth 콜백/requireAdmin이 담당)
    const discordId = getDiscordId(user)
    if (discordId) {
      const { data: byDiscord } = await supabaseAdmin
        .from('members')
        .select(columns)
        .eq('discord_id', discordId)
        .maybeSingle()
      member = byDiscord ?? null
    }
  }

  const { ok: isAdmin } = await requireAdmin()

  return { userId: user.id, member, isAdmin }
}

export function isApprovedMember(viewer: Viewer): boolean {
  return viewer.member !== null && viewer.member.status === 'approved'
}

/**
 * 내전 관리 권한: 주최자 본인 + 관리자.
 *
 * ⚠ `host_member_id`가 null(주최자가 추방된 내전)이고 열람자도 members 미연결이면
 *   `null === null`로 통과해 버린다. 그래서 null을 명시적으로 배제한다.
 */
export function canManageGame(
  game: Pick<GameRow, 'host_member_id'>,
  viewerMemberId: string | null,
  isAdmin: boolean,
): boolean {
  if (isAdmin) return true
  if (game.host_member_id === null || viewerMemberId === null) return false
  return game.host_member_id === viewerMemberId
}

export type GameManageResult =
  | { ok: true; viewer: Viewer; game: GameRow; migrationRequired: boolean }
  | { ok: false; response: NextResponse }

/**
 * 쓰기 엔드포인트 공통 가드. 미들웨어가 `/api/*`를 통과시키므로 리다이렉트가 아닌
 * JSON으로 응답해야 한다.
 */
export async function authorizeGameManage(gameId: string): Promise<GameManageResult> {
  const viewer = await getViewerMember()
  if (!viewer) {
    return {
      ok: false,
      response: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }),
    }
  }

  const fetched = await fetchGame(gameId)
  if (!fetched.ok) return { ok: false, response: fetched.response }

  if (!canManageGame(fetched.game, viewer.member?.id ?? null, viewer.isAdmin)) {
    return {
      ok: false,
      response: NextResponse.json({ error: '권한이 없습니다' }, { status: 403 }),
    }
  }

  return { ok: true, viewer, game: fetched.game, migrationRequired: fetched.migrationRequired }
}
