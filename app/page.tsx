import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member, Season } from '@/types/supabase'
import { LOL_ENABLED } from '@/lib/constants/features'
import { CARD, CARD_HOVER, CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import ProfileChecklist from '@/app/components/ProfileChecklist'
import { compareRank } from '@/lib/constants/tierOrder'
import { isApexTier, tierScore } from '@/lib/tft/tierScore'
import { formatKstShort, gameKindLabel } from '@/lib/customGames/display'
import { isMissingColumnError } from '@/lib/db/pgErrors'

export const revalidate = 60

type DashMember = Pick<
  Member,
  | 'id'
  | 'member_name'
  | 'profile_image_path'
  | 'tft_tier'
  | 'tft_rank'
  | 'tft_league_points'
  | 'tft_tier_prev'
  | 'tft_rank_prev'
  | 'tft_lp_prev'
  | 'last_synced_at'
>

type RecruitingGame = {
  id: string
  title: string
  game_kind: string | null
  game_kind_label: string | null
  scheduled_at: string | null
  capacity: number | null
}

type MatchParticipantRow = {
  member_id: string | null
  placement: number | null
}

type RecentMatchRow = {
  match_id: string
  game_datetime: string | null
  queue_id: number | null
  tft_match_participants: MatchParticipantRow[]
}

const MEMBER_COLUMNS =
  'id,member_name,profile_image_path,tft_tier,tft_rank,tft_league_points,tft_tier_prev,tft_rank_prev,tft_lp_prev,last_synced_at'

const QUEUE_LABELS: Record<number, string> = {
  1100: '솔로',
  1160: '더블업',
}

const NAV_CARDS = [
  { href: '/tft', title: '롤체 랭킹', description: 'TFT 솔로·더블업 리더보드', icon: '♟' },
  { href: '/custom-games', title: '내전', description: '모집과 라운드별 결과', icon: '⚔' },
  { href: '/steam', title: '스팀', description: '같이 할 게임과 플레이타임', icon: '🎮' },
  { href: '/hall-of-fame', title: '명예의 전당', description: '시즌 최종 순위', icon: '🏆' },
  // LoL 은 Riot 제품 권한 승인 전까지 비활성. /lol 이 404 이므로 카드도 숨긴다.
  ...(LOL_ENABLED
    ? [{ href: '/lol', title: '롤', description: '리그 오브 레전드 솔로랭크', icon: '🗡' }]
    : []),
]

function profileImageUrl(path: string | null): string | null {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${path}`
}

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

function titleCase(tier: string) {
  return tier.charAt(0).toUpperCase() + tier.slice(1).toLowerCase()
}

function formatRank(tier: string | null, rank: string | null, lp: number | null) {
  if (!tier) return '언랭'
  // 마스터 이상은 디비전이 없다. 저장된 'I' 를 그대로 보여주면 오정보가 된다.
  const division = rank && !isApexTier(tier) ? ` ${rank}` : ''
  return `${titleCase(tier)}${division} ${lp ?? 0}LP`
}

/** 마이그레이션(20260725) 미적용 환경에서도 대시보드가 죽지 않도록 신규 컬럼 부재를 흡수한다. */
async function fetchRecruiting(): Promise<{ rows: RecruitingGame[]; count: number }> {
  const full = await supabaseService
    .from('custom_games')
    .select('id,title,game_kind,game_kind_label,scheduled_at,capacity', { count: 'exact' })
    .eq('status', 'recruiting')
    .order('scheduled_at', { ascending: true })
    .limit(3)

  if (!full.error) {
    return { rows: (full.data ?? []) as unknown as RecruitingGame[], count: full.count ?? 0 }
  }
  if (!isMissingColumnError(full.error)) {
    console.error('Supabase error:', full.error)
    return { rows: [], count: 0 }
  }

  const legacy = await supabaseService
    .from('custom_games')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'recruiting')

  return { rows: [], count: legacy.error ? 0 : legacy.count ?? 0 }
}

async function fetchRecentMatches(memberIds: string[]): Promise<RecentMatchRow[]> {
  if (memberIds.length === 0) return []

  // 조인 안쪽 status 필터 대신 승인 멤버 id 배열로 좁힌다(검증이 쉽고 누락이 드러난다).
  const { data, error } = await supabaseService
    .from('tft_matches')
    .select('match_id,game_datetime,queue_id,tft_match_participants!inner(member_id,placement)')
    .in('tft_match_participants.member_id', memberIds)
    .order('game_datetime', { ascending: false })
    .limit(5)

  if (error) {
    console.error('Supabase error:', error)
    return []
  }
  return (data ?? []) as unknown as RecentMatchRow[]
}

export default async function DashboardPage() {
  const [membersResult, seasonResult, recruiting] = await Promise.all([
    supabase.from('members').select(MEMBER_COLUMNS).eq('status', 'approved'),
    supabaseService.from('seasons').select('season_name,set_number').eq('is_active', true).maybeSingle(),
    fetchRecruiting(),
  ])

  if (membersResult.error) console.error('Supabase error:', membersResult.error)

  // 이 프로젝트의 Database 제네릭은 select 결과를 추론하지 못한다(전역적으로 never).
  // app/tft/page.tsx 와 동일하게 명시 캐스팅으로 처리한다.
  const members = (membersResult.data ?? []) as unknown as DashMember[]
  const activeSeason = seasonResult.data as Pick<Season, 'season_name' | 'set_number'> | null

  const recentMatches = await fetchRecentMatches(members.map((m) => m.id))

  const memberNameById = new Map(members.map((m) => [m.id, m.member_name]))

  const lastSyncedAt = members.reduce<string | null>((acc, m) => {
    if (!m.last_synced_at) return acc
    return !acc || m.last_synced_at > acc ? m.last_synced_at : acc
  }, null)

  const leaderboard = members
    .filter((m) => !!m.tft_tier)
    .sort((a, b) => compareRank({ tier: a.tft_tier, rank: a.tft_rank, lp: a.tft_league_points }, { tier: b.tft_tier, rank: b.tft_rank, lp: b.tft_league_points }))
    .slice(0, 5)

  // 랭크 변동은 members 같은 행의 tft_*_prev 로 파생한다 — 추가 쿼리 0.
  const movers = members
    .map((m) => {
      const now = tierScore(m.tft_tier, m.tft_rank, m.tft_league_points)
      const prev = tierScore(m.tft_tier_prev, m.tft_rank_prev, m.tft_lp_prev)
      return { member: m, delta: now - prev, valid: now >= 0 && prev >= 0 }
    })
    .filter((row) => row.valid && row.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3)

  const stats = [
    { label: '승인 멤버', value: `${members.length}명` },
    {
      label: '현재 시즌',
      value: activeSeason ? `${activeSeason.season_name} (SET ${activeSeason.set_number})` : '진행 중인 시즌 없음',
    },
    { label: '최근 동기화', value: formatSyncedAt(lastSyncedAt) },
  ]

  return (
    <main className={SHELL}>
      <div className={CONTAINER}>
        <PageHeader
          kicker="Dashboard"
          accent="amber"
          title="롤토 컴퍼니"
          description="오늘 단톡방에 무슨 일이 있었는지 한눈에 확인하세요."
          className="mb-8"
        />

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {stats.map((stat) => (
            <div key={stat.label} className={`${CARD} px-5 py-4`}>
              <p className="text-xs font-black tracking-[0.15em] uppercase text-slate-500">{stat.label}</p>
              <p className="mt-2 text-lg font-bold text-white truncate">{stat.value}</p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ① 리더보드 TOP5 */}
          <section className={`${CARD} p-5 lg:col-span-2`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-white">롤체 TOP 5</h2>
              <Link href="/tft" className="text-xs font-bold text-indigo-300 hover:text-indigo-200">
                전체 보기 →
              </Link>
            </div>

            {leaderboard.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">아직 랭크 기록이 없어요.</p>
            ) : (
              <ol className="mt-3 divide-y divide-line">
                {leaderboard.map((m, i) => {
                  const url = profileImageUrl(m.profile_image_path)
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-2.5 min-h-[44px]">
                      <span className="w-5 shrink-0 text-center text-sm font-black text-slate-500">{i + 1}</span>
                      {url ? (
                        <Image
                          src={url}
                          alt=""
                          width={32}
                          height={32}
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="h-8 w-8 shrink-0 rounded-full bg-surface-2" aria-hidden />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{m.member_name}</span>
                      <span className="shrink-0 text-xs font-bold text-slate-400">
                        {formatRank(m.tft_tier, m.tft_rank, m.tft_league_points)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            )}
          </section>

          {/* ② 최근 랭크 변동 */}
          <section className={`${CARD} p-5`}>
            <h2 className="text-sm font-black text-white">최근 랭크 변동</h2>

            {movers.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">직전 동기화 대비 변동이 없어요.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {movers.map(({ member, delta }) => {
                  const up = delta > 0
                  return (
                    <li key={member.id} className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-white">{member.member_name}</span>
                        <span
                          className={`shrink-0 text-xs font-black ${up ? 'text-emerald-400' : 'text-red-400'}`}
                        >
                          {up ? '▲' : '▼'} {Math.abs(delta)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 truncate">
                        {formatRank(member.tft_tier_prev, member.tft_rank_prev, member.tft_lp_prev)}
                        {' → '}
                        {formatRank(member.tft_tier, member.tft_rank, member.tft_league_points)}
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ③ 모집 중 내전 */}
          <section className={`${CARD} p-5`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-black text-white">모집 중 내전</h2>
              <Link href="/custom-games" className="text-xs font-bold text-indigo-300 hover:text-indigo-200">
                전체 보기 →
              </Link>
            </div>

            {recruiting.rows.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">
                {recruiting.count > 0 ? `모집 중 ${recruiting.count}건` : '지금 모집 중인 내전이 없어요.'}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {recruiting.rows.map((game) => (
                  <li key={game.id}>
                    <Link
                      href={`/custom-games/${game.id}`}
                      className="block min-h-[44px] rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-sm font-bold text-white">{game.title}</span>
                        <span className="shrink-0 text-xs font-bold text-indigo-300">
                          {gameKindLabel(game.game_kind, game.game_kind_label)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {game.scheduled_at ? formatKstShort(game.scheduled_at) : '일정 미정'}
                        {game.capacity ? ` · 정원 ${game.capacity}명` : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ④ 최근 매치 */}
          <section className={`${CARD} p-5 lg:col-span-2`}>
            <h2 className="text-sm font-black text-white">최근 매치</h2>

            {recentMatches.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">아직 수집된 매치가 없어요.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {recentMatches.map((match) => {
                  const results = match.tft_match_participants
                    .filter((p) => p.member_id && memberNameById.has(p.member_id))
                    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))

                  return (
                    <li key={match.match_id} className="py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-400">
                          {match.queue_id !== null ? QUEUE_LABELS[match.queue_id] ?? '기타' : '기타'}
                        </span>
                        <span className="text-xs text-slate-500">
                          {match.game_datetime ? formatKstShort(match.game_datetime) : ''}
                        </span>
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {results.map((p, i) => (
                          <span
                            key={`${match.match_id}-${p.member_id}-${i}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1 text-xs font-bold text-white"
                          >
                            {memberNameById.get(p.member_id as string)}
                            <span className={p.placement === 1 ? 'text-amber-400' : (p.placement ?? 9) <= 4 ? 'text-emerald-400' : 'text-slate-500'}>
                              {p.placement ?? '-'}위
                            </span>
                          </span>
                        ))}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          {/* ⑤ 프로필 체크리스트 — 개인화. ISR(revalidate=60) 공유 캐시라 반드시 클라이언트 아일랜드로 둔다. */}
          <div className="lg:col-span-1">
            <ProfileChecklist />
          </div>
        </div>

        {/* ⑥ 축약된 네비 카드 */}
        <section className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {NAV_CARDS.map((card) => (
            <Link key={card.href} href={card.href} className={`${CARD_HOVER} flex items-center gap-3 px-4 py-3.5`}>
              <span className="text-xl leading-none" aria-hidden>
                {card.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-white">{card.title}</span>
                <span className="block truncate text-xs text-slate-500">{card.description}</span>
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
