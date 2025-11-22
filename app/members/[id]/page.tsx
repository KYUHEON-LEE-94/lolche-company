// app/members/[id]/page.tsx
import { supabase } from '@/lib/supabase'
import type { Member, TftMatchParticipant } from '@/types/supabase'

type PageProps = {
  params: { id: string }
}

export default async function MemberDetailPage({ params }: PageProps) {
  const memberId = params.id

  // 1) 멤버 정보
  const { data: memberData, error: memberError } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .single()

  if (memberError || !memberData) {
    console.error(memberError)
    return <main className="p-4">멤버 정보를 찾을 수 없습니다.</main>
  }

  const member = memberData as Member

  // 2) 최근 전적 (참가자 테이블만)
  const { data: partData, error: partError } = await supabase
    .from('tft_match_participants')
    .select('*')
    .eq('member_id', memberId)
    .order('id', { ascending: false })
    .limit(10)

  if (partError) {
    console.error(partError)
  }

  const participants = (partData ?? []) as TftMatchParticipant[]

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-2">{member.member_name}</h1>
      <p className="text-gray-600 mb-4">
        Riot ID: {member.riot_game_name}#{member.riot_tagline}
      </p>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">TFT 랭크</h2>
        <div className="space-y-1">
          <div>
            티어: {member.tft_tier} {member.tft_rank}
          </div>
          <div>LP: {member.tft_league_points ?? '-'}</div>
          <div>
            전적: {member.tft_wins ?? 0}승 {member.tft_losses ?? 0}패
          </div>
          <div>최근 동기화: {member.last_synced_at ?? '알 수 없음'}</div>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-2">최근 경기</h2>
        {participants.length === 0 ? (
          <div>저장된 전적이 없습니다.</div>
        ) : (
          <ul className="space-y-2">
            {participants.map((p) => (
              <li
                key={p.id}
                className="border rounded p-2 flex justify-between items-center"
              >
                <div>
                  <div>매치 ID: {p.match_id}</div>
                  <div>등수: {p.placement ?? '-'}</div>
                </div>
                <div>레벨: {p.level ?? '-'}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}