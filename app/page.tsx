// app/page.tsx
import { supabase } from '@/lib/supabase'
import type { Member } from '@/types/supabase'
import MemberRanking from './MemberRanking'

export default async function HomePage() {
  const { data, error } = await supabase
  .from('members')
  .select('*')
  .not('tft_tier', 'is', null) // 티어 있는 멤버만

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
