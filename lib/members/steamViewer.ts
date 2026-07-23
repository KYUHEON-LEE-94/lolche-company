import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMyMember } from './myMember'

/**
 * "나와 같은 게임을 가진 사람들" 개인화 섹션의 요청자 상태 해석.
 *
 * ⚠ member_id 는 전적으로 세션에서 유도한다. 요청 body/path 의 어떤 member 식별자도
 *   신뢰하지 않는다.
 * ⚠ DB(members)만 읽는다. lib/steam/* (STEAM_API_KEY) 는 import 하지 않는다.
 */
export type SteamViewerState = 'ok' | 'no_member' | 'no_steam' | 'private'

const STEAM_VISIBILITY_PUBLIC = 3

export type SteamViewerResult =
  | { ok: false; status: number; message: string }
  | { ok: true; state: 'ok'; memberId: string }
  | { ok: true; state: Exclude<SteamViewerState, 'ok'>; memberId: null }

export async function resolveSteamViewer(): Promise<SteamViewerResult> {
  const me = await getMyMember()
  if (!me.ok) return { ok: false, status: me.status, message: me.message }
  if (!me.member) return { ok: true, state: 'no_member', memberId: null }

  // 노출 필터를 요청자 측에도 대칭 적용한다 (CLAUDE.md).
  if (me.member.status !== 'approved') {
    return { ok: false, status: 403, message: '승인된 멤버만 이용할 수 있습니다.' }
  }

  const { data, error } = await supabaseAdmin
    .from('members')
    .select('steam_id64, steam_visibility')
    .eq('id', me.member.id)
    .maybeSingle()

  if (error) return { ok: false, status: 500, message: error.message }
  if (!data?.steam_id64) return { ok: true, state: 'no_steam', memberId: null }
  if (data.steam_visibility != null && data.steam_visibility !== STEAM_VISIBILITY_PUBLIC) {
    return { ok: true, state: 'private', memberId: null }
  }

  return { ok: true, state: 'ok', memberId: me.member.id }
}
