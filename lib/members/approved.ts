import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// member UUID 는 /tft 페이로드로 공개되므로, 공개 조회 API 는
// 대상 멤버가 approved 인지 반드시 확인해야 한다.
// 존재를 알리지 않기 위해 호출부는 403 이 아니라 404 로 응답한다.
export async function isApprovedMember(memberId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('members')
    .select('id')
    .eq('id', memberId)
    .eq('status', 'approved')
    .maybeSingle()

  // 잘못된 UUID 형식이면 Postgres 22P02 → 존재하지 않는 것으로 취급
  if (error) return false
  return !!data
}
