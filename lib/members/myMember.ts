import 'server-only'
import { getCurrentUser } from '@/lib/supabase/route'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getDiscordId } from '@/lib/auth/discord'
import type { MemberStatus } from '@/types/supabase'

export type MyMember = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  status: MemberStatus
}

const COLUMNS = 'id, member_name, riot_game_name, riot_tagline, status, user_id'

/**
 * 세션 → 내 members 행 해석.
 *
 * ⚠ 요청 body에 실린 어떤 member 식별자도 신뢰하지 않는다. riot_accounts 소유권
 *   판정은 전적으로 이 함수가 돌려주는 id로만 한다.
 */
export async function getMyMember(): Promise<
  { ok: true; userId: string; member: MyMember | null } | { ok: false; status: number; message: string }
> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, status: 401, message: '로그인이 필요합니다.' }

  const { data: byUserId, error } = await supabaseAdmin
    .from('members')
    .select(COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { ok: false, status: 500, message: error.message }
  if (byUserId) {
    return { ok: true, userId: user.id, member: toMyMember(byUserId) }
  }

  // 관리자가 discord_id만 사전 등록한 계정 대비 fallback
  const discordId = getDiscordId(user)
  if (!discordId) return { ok: true, userId: user.id, member: null }

  const { data: byDiscord, error: discordError } = await supabaseAdmin
    .from('members')
    .select(COLUMNS)
    .eq('discord_id', discordId)
    .maybeSingle()

  if (discordError) return { ok: false, status: 500, message: discordError.message }
  // 다른 계정이 이미 연결된 행은 계정 탈취 방지를 위해 내 것으로 취급하지 않는다.
  if (!byDiscord || (byDiscord.user_id && byDiscord.user_id !== user.id)) {
    return { ok: true, userId: user.id, member: null }
  }

  return { ok: true, userId: user.id, member: toMyMember(byDiscord) }
}

function toMyMember(row: {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  status: MemberStatus
}): MyMember {
  return {
    id: row.id,
    member_name: row.member_name,
    riot_game_name: row.riot_game_name,
    riot_tagline: row.riot_tagline,
    status: row.status,
  }
}
