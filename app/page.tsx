// page.tsx
import { supabase } from '@/app/lib/supabase'
import type { Member } from '@/types/supabase'

function tierOrder(tier: string | null): number {
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

// "W,L,W,L,W" 같은 문자열이라고 가정
function parseRecent5(raw: string | null | undefined): ('W' | 'L')[] {
  if (!raw) return []
  return raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s === 'W' || s === 'L') as ('W' | 'L')[]
}

function recent5WinRate(recent: ('W' | 'L')[]): number {
  if (recent.length === 0) return 0
  const wins = recent.filter((r) => r === 'W').length
  return Math.round((wins / recent.length) * 100)
}

function recent5Display(recent: ('W' | 'L')[]): string {
  if (recent.length === 0) return '-'
  // W/L -> 승/패 로 표기
  return recent
      .map((r) => (r === 'W' ? '승' : '패'))
      .join(' ')
}

export default async function HomePage() {
  const { data, error } = await supabase
      .from('members')
      .select('*')
      .not('tft_tier', 'is', null)       // 티어 있는 멤버만
      .order('tft_league_points', { ascending: false })

  if (error) {
    console.error('Supabase error:', error)
  }

  const members = (data ?? []) as Member[]

  const sorted = members.sort((a, b) => {
    const tierDiff = tierOrder(a.tft_tier) - tierOrder(b.tft_tier)
    if (tierDiff !== 0) return tierDiff

    const lpA = a.tft_league_points ?? 0
    const lpB = b.tft_league_points ?? 0
    return lpB - lpA
  })

  return (
      <main className="max-w-5xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-4">롤체 컴퍼니</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((m, idx) => {
            const recent = parseRecent5(
                // DB 컬럼명에 맞게 수정해줘 (예: m.tft_recent5)
                // 지금은 Member 타입에 tft_recent5가 있다고 가정
                (m as any).tft_recent5
            )
            const winRate = recent5WinRate(recent)
            const recentText = recent5Display(recent)

            return (
                <article
                    key={m.id}
                    className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* 상단: 랭킹 + 티어 */}
                  <header className="flex items-center justify-between">
                    <div className="text-sm text-gray-500">#{idx + 1}</div>
                    <div className="flex flex-col items-end">
                      <span className="text-xs text-gray-400">티어</span>
                      <span className="text-sm font-semibold">
                    {m.tft_tier ?? '-'} {m.tft_rank ?? ''}
                  </span>
                      <span className="text-xs text-gray-500">
                    LP {m.tft_league_points ?? 0}
                  </span>
                    </div>
                  </header>

                  {/* Riot / 단톡방 아이디 */}
                  <section className="text-sm space-y-1">
                    <div>
                      <span className="font-medium text-gray-700">Riot ID</span>{' '}
                      <span className="text-gray-900">
                    {/* DB 컬럼명에 맞게 수정: riot_id 가정 */}
                        {(m as any).riot_id ?? '-'}
                  </span>
                    </div>
                    <div>
                      <span className="font-medium text-gray-700">단톡방 아이디</span>{' '}
                      <span className="text-gray-900">
                    {/* DB 컬럼명에 맞게 수정: chat_id 가정 */}
                        {(m as any).chat_id ?? '-'}
                  </span>
                    </div>
                  </section>

                  {/* 전적 영역 */}
                  <section className="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                    <div className="mb-1 flex items-center justify-between">
                      <span className="font-medium text-gray-700">최근 5판 전적</span>
                      <span className="text-xs text-gray-500">
                    승률 {winRate}%
                  </span>
                    </div>
                    <div className="text-gray-800">
                      {recent.length > 0 ? recentText : '전적 정보 없음'}
                    </div>
                  </section>

                  {/* 멤버 상세 페이지 링크 (원래 있던 기능 유지) */}
                  <footer className="mt-2 flex justify-end">
                    <a
                        href={`/members/${m.id}`}
                        className="text-xs text-blue-600 hover:underline"
                    >
                      상세 보기
                    </a>
                  </footer>
                </article>
            )
          })}
        </div>
      </main>
  )
}
