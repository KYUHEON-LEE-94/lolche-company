import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member } from '@/types/supabase'
import MemberRanking from './MemberRanking'
import { TABBAR_SAFE_PB } from '@/lib/ui/styles'

export const revalidate = 60

export default async function TftRankingPage() {
  const [{ data, error }, { data: activeSeason }] = await Promise.all([
    supabase
      .from('members')
      .select('*')
      // 승인 대기/거절 상태의 자가 등록 멤버는 랭킹에 노출하지 않는다.
      .eq('status', 'approved')
      .or('tft_tier.not.is.null,tft_doubleup_tier.not.is.null')
      .order('member_name', { ascending: true }),
    supabaseService
      .from('seasons')
      .select('*')
      .eq('is_active', true)
      .maybeSingle(),
  ])

  if (error) console.error('Supabase error:', error)

  return (
    // MemberRanking 은 SHELL 을 쓰지 않고 자체 셸을 가진다. 모바일 하단 탭바 여백만 여기서 보탠다.
    <main className={`mx-auto ${TABBAR_SAFE_PB}`}>
      <MemberRanking
        members={(data ?? []) as Member[]}
        currentSeason={activeSeason}
      />
    </main>
  )
}
