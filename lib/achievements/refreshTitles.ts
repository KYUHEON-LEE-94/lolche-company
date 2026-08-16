import 'server-only'
import { isMissingFunctionError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

/** 업적 스키마가 아직 배포되지 않았어도 핵심 동기화/출석을 막지 않는다. */
export async function refreshMemberTitles(memberId: string) {
  const { error } = await supabaseAdmin.rpc('refresh_member_title_achievements', { p_member_id: memberId })
  if (!error || isMissingFunctionError(error)) return
  console.warn('[achievements] 칭호 갱신 실패:', error.message)
}
