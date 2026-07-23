import type { Metadata } from 'next'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Member } from '@/types/supabase'
import { compareRank } from '@/lib/constants/tierOrder'
import { LOL_ENABLED } from '@/lib/constants/features'
import { CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import EmptyState from '@/app/components/ui/EmptyState'

export const revalidate = 60

export const metadata: Metadata = {
  title: '롤 랭킹 · 롤토 컴퍼니',
}

type LolMember = Pick<
  Member,
  | 'id'
  | 'member_name'
  | 'riot_game_name'
  | 'riot_tagline'
  | 'profile_image_path'
  | 'lol_tier'
  | 'lol_rank'
  | 'lol_league_points'
  | 'lol_wins'
  | 'lol_losses'
>

const TIER_STYLES: Record<string, { text: string; badge: string; icon: string }> = {
  CHALLENGER:  { text: 'text-yellow-400',  badge: 'bg-yellow-400/10 text-yellow-300 border-yellow-500/20',    icon: '👑' },
  GRANDMASTER: { text: 'text-red-400',     badge: 'bg-red-500/10 text-red-300 border-red-500/20',             icon: '♦' },
  MASTER:      { text: 'text-purple-400',  badge: 'bg-purple-500/10 text-purple-300 border-purple-500/20',    icon: '◆' },
  DIAMOND:     { text: 'text-blue-400',    badge: 'bg-blue-500/10 text-blue-300 border-blue-500/20',          icon: '◇' },
  EMERALD:     { text: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', icon: '◈' },
  PLATINUM:    { text: 'text-cyan-400',    badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',          icon: '◉' },
  GOLD:        { text: 'text-amber-400',   badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',       icon: '○' },
  SILVER:      { text: 'text-slate-400',   badge: 'bg-slate-400/10 text-slate-300 border-slate-400/20',       icon: '○' },
  BRONZE:      { text: 'text-orange-400',  badge: 'bg-orange-500/10 text-orange-300 border-orange-500/20',    icon: '○' },
  IRON:        { text: 'text-gray-400',    badge: 'bg-gray-500/10 text-gray-300 border-gray-500/20',          icon: '◌' },
}

const FALLBACK_STYLE = {
  text: 'text-slate-400',
  badge: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
  icon: '?',
}

function getTierStyle(tier: string | null) {
  const key = tier?.toUpperCase() ?? ''
  return TIER_STYLES[key] ?? FALLBACK_STYLE
}

function getProfileImageUrl(path: string | null) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${path}`
}

/** 마스터 이상은 디비전이 없으므로 티어명만 노출한다. */
const APEX_TIERS = new Set(['CHALLENGER', 'GRANDMASTER', 'MASTER'])

function formatTier(tier: string | null, rank: string | null) {
  if (!tier) return '언랭'
  const upper = tier.toUpperCase()
  const label = upper.charAt(0) + upper.slice(1).toLowerCase()
  if (APEX_TIERS.has(upper) || !rank) return label
  return `${label} ${rank}`
}

function formatRecord(wins: number | null, losses: number | null) {
  const w = wins ?? 0
  const l = losses ?? 0
  const total = w + l
  if (total === 0) return null
  return `${w}승 ${l}패 · ${Math.round((w / total) * 100)}%`
}

export default async function LolPage() {
  // 네비게이션에서 숨기는 것만으로는 부족하다. URL 직접 접근도 차단한다.
  if (!LOL_ENABLED) notFound()

  const { data, error } = await supabase
    .from('members')
    .select(
      'id,member_name,riot_game_name,riot_tagline,profile_image_path,lol_tier,lol_rank,lol_league_points,lol_wins,lol_losses',
    )
    // 승인 대기/거절 상태의 자가 등록 멤버는 랭킹에 노출하지 않는다.
    .eq('status', 'approved')
    .order('member_name', { ascending: true })

  if (error) console.error('Supabase error:', error)

  const members = (data ?? []) as LolMember[]
  // 언랭(데이터 없음)은 compareRank 가 999 로 취급해 자동으로 최하단에 정렬된다.
  const sorted = [...members].sort((a, b) =>
    compareRank(
      { tier: a.lol_tier, rank: a.lol_rank, lp: a.lol_league_points },
      { tier: b.lol_tier, rank: b.lol_rank, lp: b.lol_league_points },
    ),
  )
  const rankedCount = sorted.filter((m) => m.lol_tier).length

  return (
    <main className={SHELL}>
      <div className={CONTAINER}>
        <PageHeader
          kicker="League of Legends"
          accent="sky"
          title="롤 랭킹"
          description="등록된 라이엇 계정의 솔로랭크 기록입니다. 별도 입력은 필요하지 않습니다."
        />

        {rankedCount === 0 ? (
          <EmptyState>아직 동기화된 롤 랭크 정보가 없습니다.</EmptyState>
        ) : (
          <ol className="space-y-2">
            {sorted.map((m, idx) => {
              const style = getTierStyle(m.lol_tier)
              const imageUrl = getProfileImageUrl(m.profile_image_path)
              const record = formatRecord(m.lol_wins, m.lol_losses)
              const unranked = !m.lol_tier

              return (
                <li
                  key={m.id}
                  className={`flex items-center gap-3 rounded-2xl border border-line px-4 py-3 transition-colors hover:border-line-strong ${
                    unranked ? 'bg-surface opacity-70' : 'bg-surface'
                  }`}
                >
                  <div className="flex w-8 shrink-0 items-center justify-center text-xs font-bold text-slate-500">
                    {unranked ? '-' : `#${idx + 1}`}
                  </div>

                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt=""
                        fill
                        sizes="40px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                        {m.member_name.slice(0, 1)}
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{m.member_name}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {m.riot_game_name}#{m.riot_tagline}
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!unranked && <span className="text-sm leading-none">{style.icon}</span>}
                      <span
                        className={`text-sm font-black ${unranked ? 'text-slate-500' : style.text}`}
                      >
                        {formatTier(m.lol_tier, m.lol_rank)}
                      </span>
                      {!unranked && (
                        <span
                          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${style.badge}`}
                        >
                          {m.lol_league_points ?? 0} LP
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">{record ?? '전적 없음'}</p>
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </main>
  )
}
