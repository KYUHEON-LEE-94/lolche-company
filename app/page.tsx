// app/page.tsx
import { supabase } from '@/lib/supabase'
import type { Member } from '@/types/supabase'
import MemberRanking from './MemberRanking'

export default async function HomePage() {
  const { data, error } = await supabase
  .from('members')
  .select('*')
  .or('tft_tier.not.is.null,tft_doubleup_tier.not.is.null') // ✅ 둘 중 하나만 있어도 포함
  .order('member_name', { ascending: true }) // 정렬 기준은 자유롭게

  if (error) {
    console.error('Supabase error:', error)
  }

  const members = (data ?? []) as Member[]

  return (
      <main className="max-w-5xl mx-auto p-4">
        <MemberRanking members={members} />
      </main>
  )
}
