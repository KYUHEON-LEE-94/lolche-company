// app/page.tsx
import { supabase } from '@/app/lib/supabase'
import type { Member } from '@/types/supabase'

function tierOrder(tier: string | null): number {
  // DB에 어떤 값이 들어가는지 기준으로 맞춰줘
  switch (tier) {
    case 'CHALLENGER':   return 1
    case 'GRANDMASTER':  return 2
    case 'MASTER':       return 3
    case 'DIAMOND':      return 4
    case 'EMERALD':      return 5
    case 'PLATINUM':     return 6
    case 'GOLD':         return 7
    case 'SILVER':       return 8
    case 'BRONZE':       return 9
    case 'IRON':         return 10
    default:             return 999
  }
}

export default async function HomePage() {
  const { data, error } = await supabase
    .from('members')
    .select('*')
    .not('tft_tier', 'is', null)       // 티어가 있는 멤버만
    .order('tft_league_points', { ascending: false })

  if (error) {
    console.error('Supabase error:', error)
  }

  // supabase에서 tier 정렬은 case-when으로 해도 되지만
  // 귀찮으면 일단 JS에서 정렬
  const members = (data ?? []) as Member[]
  const sorted = members.sort((a, b) => {
    const tierDiff = tierOrder(a.tft_tier) - tierOrder(b.tft_tier)
    if (tierDiff !== 0) return tierDiff

    // tier 같으면 LP 내림차순
    const lpA = a.tft_league_points ?? 0
    const lpB = b.tft_league_points ?? 0
    return lpB - lpA
  })

  return (
    <main className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">TFT 랭킹</h1>

      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2">#</th>
            <th className="text-left py-2">멤버</th>
            <th className="text-left py-2">티어</th>
            <th className="text-left py-2">LP</th>
            <th className="text-left py-2">전적</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, idx) => (
            <tr key={m.id} className="border-b hover:bg-gray-50">
              <td className="py-1">{idx + 1}</td>
              <td className="py-1">
                {/* 멤버 상세 페이지로 이동하는 링크 */}
                <a
                  href={`/members/${m.id}`}
                  className="text-blue-600 hover:underline"
                >
                  {m.member_name}
                </a>
              </td>
              <td className="py-1">
                {m.tft_tier} {m.tft_rank}
              </td>
              <td className="py-1">{m.tft_league_points ?? '-'}</td>
              <td className="py-1">
                {m.tft_wins ?? 0}승 {m.tft_losses ?? 0}패
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
