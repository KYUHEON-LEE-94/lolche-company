import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member } from '@/types/supabase'
import MemberRanking from './MemberRanking'

export const revalidate = 60

export default async function HomePage() {
  const [{ data, error }, { data: activeSeason }] = await Promise.all([
    supabase
      .from('members')
      .select('*')
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
    <main className="mx-auto">
      <MemberRanking
        members={(data ?? []) as Member[]}
        currentSeason={activeSeason}
      />
    </main>
  )
}
