import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member, Season } from '@/types/supabase'
import { LOL_ENABLED } from '@/lib/constants/features'

export const revalidate = 60

type NavCard = {
  href: string
  title: string
  description: string
  icon: string
  accent: string
  ready: boolean
}

const NAV_CARDS: NavCard[] = [
  {
    href: '/tft',
    title: '롤체 랭킹',
    description: 'TFT 솔로·더블업 랭크 리더보드',
    icon: '♟',
    accent: 'from-amber-400/20 to-amber-600/5 border-amber-500/20',
    ready: true,
  },
  {
    href: '/custom-games',
    title: '내전',
    description: '내전 기록과 라운드별 결과',
    icon: '⚔',
    accent: 'from-indigo-400/20 to-indigo-600/5 border-indigo-500/20',
    ready: true,
  },
  {
    href: '/hall-of-fame',
    title: '명예의 전당',
    description: '시즌 마감 시점의 최종 순위',
    icon: '🏆',
    accent: 'from-yellow-400/20 to-yellow-600/5 border-yellow-500/20',
    ready: true,
  },
  // LoL 은 Riot 제품 권한 승인 전까지 비활성. /lol 이 404 이므로 카드도 숨긴다.
  ...(LOL_ENABLED
    ? [{
        href: '/lol',
        title: '롤',
        description: '리그 오브 레전드 솔로랭크 랭킹',
        icon: '⚔',
        accent: 'from-sky-400/20 to-sky-600/5 border-sky-500/20',
        ready: true,
      }]
    : []),
  {
    href: '/steam',
    title: '스팀',
    description: '함께 할 수 있는 게임과 플레이타임',
    icon: '🎮',
    accent: 'from-emerald-400/20 to-emerald-600/5 border-emerald-500/20',
    ready: true,
  },
]

function formatSyncedAt(value: string | null) {
  if (!value) return '기록 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '기록 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(date)
}

export default async function DashboardPage() {
  const memberCountPromise = supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')

  const seasonPromise = supabaseService
    .from('seasons')
    .select('season_name,set_number')
    .eq('is_active', true)
    .maybeSingle()

  const lastSyncPromise = supabase
    .from('members')
    .select('last_synced_at')
    .eq('status', 'approved')
    .not('last_synced_at', 'is', null)
    .order('last_synced_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const memberCountResult = await memberCountPromise
  const seasonResult = await seasonPromise
  const lastSyncResult = await lastSyncPromise

  if (memberCountResult.error) console.error('Supabase error:', memberCountResult.error)
  if (lastSyncResult.error) console.error('Supabase error:', lastSyncResult.error)

  const approvedCount = memberCountResult.count ?? 0
  // 이 프로젝트의 Database 제네릭은 select 결과를 추론하지 못한다(전역적으로 never).
  // app/tft/page.tsx 와 동일하게 명시 캐스팅으로 처리한다.
  const activeSeason = seasonResult.data as Pick<Season, 'season_name' | 'set_number'> | null
  const lastSyncRow = lastSyncResult.data as Pick<Member, 'last_synced_at'> | null
  const lastSyncedAt = lastSyncRow?.last_synced_at ?? null

  const stats = [
    { label: '승인 멤버', value: `${approvedCount}명` },
    {
      label: '현재 시즌',
      value: activeSeason ? `${activeSeason.season_name} (SET ${activeSeason.set_number})` : '진행 중인 시즌 없음',
    },
    { label: '최근 동기화', value: formatSyncedAt(lastSyncedAt) },
  ]

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-[#07090f] px-4 py-12">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="h-px w-10 bg-gradient-to-r from-transparent to-amber-500/50" />
            <span className="text-[10px] font-black tracking-[0.4em] text-amber-500 uppercase">
              Dashboard
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            롤토 컴퍼니
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            단톡방 멤버들의 랭킹과 기록을 한곳에서 확인하세요.
          </p>
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-5 py-4"
            >
              <p className="text-[10px] font-black tracking-[0.2em] uppercase text-slate-500">
                {stat.label}
              </p>
              <p className="mt-2 text-lg font-bold text-white truncate">{stat.value}</p>
            </div>
          ))}
        </section>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {NAV_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className={`group relative rounded-2xl border bg-gradient-to-br ${card.accent} p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/20`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="text-2xl leading-none">{card.icon}</span>
                {!card.ready && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/60 text-slate-300 border border-white/10">
                    준비 중
                  </span>
                )}
              </div>
              <h2 className="mt-4 text-lg font-black text-white">{card.title}</h2>
              <p className="mt-1 text-xs text-slate-400">{card.description}</p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
