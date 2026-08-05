import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member, Season } from '@/types/supabase'
import { LOL_ENABLED } from '@/lib/constants/features'
import { CARD, CARD_HOVER, CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import ProfileChecklist from '@/app/components/ProfileChecklist'
import TodayMyRecord from '@/app/TodayMyRecord'
import AdminPendingNotice from '@/app/components/AdminPendingNotice'
import DashboardRankSections, {
  type DashMover,
  type DashRankMember,
} from '@/app/DashboardRankSections'
import { compareRank } from '@/lib/constants/tierOrder'
import { isApexTier, tierScore } from '@/lib/tft/tierScore'
import { formatKstShort, gameKindLabel } from '@/lib/customGames/display'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import { resolveAvatarUrl, withAvatarColumn } from '@/lib/members/avatar'
import { getKrMaps, getUnitImageUrl, rarityBorderClass, toKrChampionName, toKrTraitName, type KrMaps } from '@/lib/tft/tftLocale'

export const revalidate = 60

type DashMember = Pick<
  Member,
  | 'id'
  | 'member_name'
  | 'profile_image_path'
  | 'discord_avatar_url'
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
  traits: unknown
  units: unknown
}

type RecentMatchRow = {
  match_id: string
  game_datetime: string | null
  queue_id: number | null
  tft_match_participants: MatchParticipantRow[]
}

type RawUnit = {
  character_id?: string
  rarity?: number
  tier?: number
}

type RawTrait = {
  name?: string
  num_units?: number
  style?: number
  tier_current?: number
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const MEMBER_COLUMNS =
  'id,member_name,profile_image_path,tft_tier,tft_rank,tft_league_points,tft_tier_prev,tft_rank_prev,tft_lp_prev,last_synced_at'

// TFT queue_id → 모드 라벨 (Riot 공식/CommunityDragon 기준).
// ⚠ 1210=촌크의 보물은 로테이션 랩 모드이지 솔로랭크가 아니다.
// 미매핑 이벤트/랩 큐(1220·6100·6110·6120 등)는 '기타'로 폴백한다.
const QUEUE_LABELS: Record<number, string> = {
  1090: '일반',
  1100: '솔로',
  1130: '초고속',
  1160: '더블업',
  1210: '촌크의 보물',
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
    .select('match_id,game_datetime,queue_id,tft_match_participants!inner(member_id,placement,traits,units)')
    .in('tft_match_participants.member_id', memberIds)
    .order('game_datetime', { ascending: false })
    .limit(3)

  if (error) {
    console.error('Supabase error:', error)
    return []
  }
  return (data ?? []) as unknown as RecentMatchRow[]
}

function matchUnits(raw: unknown, maps: KrMaps) {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .filter((unit): unit is RawUnit => isObjectRecord(unit) && typeof unit.character_id === 'string' && unit.character_id.length > 0)
    .sort((a, b) => (b.tier ?? 0) - (a.tier ?? 0) || (b.rarity ?? 0) - (a.rarity ?? 0))
    .slice(0, 7)
    .map((unit) => ({
      id: unit.character_id as string,
      name: toKrChampionName(unit.character_id as string, maps),
      imageUrl: getUnitImageUrl(unit.character_id as string, maps),
      rarity: unit.rarity ?? 0,
      tier: unit.tier ?? 1,
    }))
}

function activeTraits(raw: unknown, maps: KrMaps) {
  if (!Array.isArray(raw)) return []
  return (raw as unknown[])
    .filter((trait): trait is RawTrait => isObjectRecord(trait) && typeof trait.name === 'string' && ((typeof trait.style === 'number' ? trait.style : 0) > 0 || (typeof trait.tier_current === 'number' ? trait.tier_current : 0) > 0))
    .sort((a, b) => (b.style ?? b.tier_current ?? 0) - (a.style ?? a.tier_current ?? 0) || (b.num_units ?? 0) - (a.num_units ?? 0))
    .slice(0, 3)
    .map((trait) => ({
      name: toKrTraitName(trait.name as string, maps),
      units: trait.num_units ?? 0,
    }))
}

export default async function DashboardPage() {
  const [membersResult, seasonResult, recruiting] = await Promise.all([
    withAvatarColumn((cols) =>
      supabase.from('members').select(`${MEMBER_COLUMNS}${cols}`).eq('status', 'approved'),
    ),
    supabaseService.from('seasons').select('season_name,set_number').eq('is_active', true).maybeSingle(),
    fetchRecruiting(),
  ])

  if (membersResult.error) console.error('Supabase error:', membersResult.error)

  // 이 프로젝트의 Database 제네릭은 select 결과를 추론하지 못한다(전역적으로 never).
  // app/tft/page.tsx 와 동일하게 명시 캐스팅으로 처리한다.
  const members = (membersResult.data ?? []) as unknown as DashMember[]
  const activeSeason = seasonResult.data as Pick<Season, 'season_name' | 'set_number'> | null

  const recentMatches = await fetchRecentMatches(members.map((m) => m.id))
  const krMaps = recentMatches.length > 0 ? await getKrMaps() : null

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

  // 아바타 URL·랭크 라벨을 서버에서 확정해 넘긴다 —
  // resolveAvatarUrl/formatRank/isApexTier 를 클라이언트 번들로 끌어오지 않기 위해서다.
  const toDashRank = (m: DashMember): DashRankMember => ({
    id: m.id,
    member_name: m.member_name,
    tft_tier: m.tft_tier,
    tft_rank: m.tft_rank,
    tft_league_points: m.tft_league_points,
    avatarUrl: resolveAvatarUrl(m),
    rankLabel: formatRank(m.tft_tier, m.tft_rank, m.tft_league_points),
  })

  const leaderboardView: DashRankMember[] = leaderboard.map(toDashRank)

  const moversView: DashMover[] = movers.map(({ member, delta }) => ({
    member: toDashRank(member),
    delta,
    prevLabel: formatRank(member.tft_tier_prev, member.tft_rank_prev, member.tft_lp_prev),
  }))

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

        <AdminPendingNotice />

        {/* 개인 데이터는 ISR HTML에 포함하지 않고 동적 API를 호출하는 클라이언트 아일랜드에서만 표시한다. */}
        <TodayMyRecord />

        <section className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div key={stat.label} className={`${CARD} relative overflow-hidden px-5 py-4`}>
              <span className="absolute inset-y-4 left-0 w-0.5 rounded-full bg-brand/50" aria-hidden />
              <p className="text-[10px] font-black tracking-[0.18em] uppercase text-subtle">{stat.label}</p>
              <p className="mt-2 truncate text-lg font-black tracking-tight text-fg">{stat.value}</p>
            </div>
          ))}
        </section>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* ①② TOP5 + 랭크 변동 — 클릭 시 상세 패널.
              ISR(revalidate=60) 공유 캐시라 상태는 클라이언트 아일랜드가 소유한다.
              Fragment 를 반환하므로 grid 직계 자식 관계와 lg:col-span-2 가 보존된다. */}
          <DashboardRankSections leaderboard={leaderboardView} movers={moversView} />

          {/* ③ 모집 중 내전 */}
          <section className={`${CARD} p-5 sm:p-6`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-black tracking-tight text-fg">모집 중 내전</h2>
              <Link href="/custom-games" className="text-xs font-bold text-brand-ink hover:text-brand-ink">
                전체 보기 →
              </Link>
            </div>

            {recruiting.rows.length === 0 ? (
              <p className="mt-4 text-sm text-subtle">
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
                        <span className="min-w-0 truncate text-sm font-bold text-fg">{game.title}</span>
                        <span className="shrink-0 text-xs font-bold text-brand-ink">
                          {gameKindLabel(game.game_kind, game.game_kind_label)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-subtle">
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
          <section className={`${CARD} p-5 sm:p-6 lg:col-span-2`}>
            <h2 className="text-lg font-black tracking-tight text-fg">최근 매치</h2>

            {recentMatches.length === 0 ? (
              <p className="mt-4 text-sm text-subtle">아직 수집된 매치가 없어요.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {recentMatches.map((match) => {
                  const results = match.tft_match_participants
                    .filter((p) => p.member_id && memberNameById.has(p.member_id))
                    .sort((a, b) => (a.placement ?? 99) - (b.placement ?? 99))

                  return (
                    <li key={match.match_id} className="py-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-muted">
                          {match.queue_id !== null ? QUEUE_LABELS[match.queue_id] ?? '기타' : '기타'}
                        </span>
                        <span className="text-xs text-subtle">
                          {match.game_datetime ? formatKstShort(match.game_datetime) : ''}
                        </span>
                      </div>
                      <div className="mt-2 space-y-2">
                        {results.map((p, i) => {
                          const units = krMaps ? matchUnits(p.units, krMaps) : []
                          const traits = krMaps ? activeTraits(p.traits, krMaps) : []
                          return (
                            <div key={`${match.match_id}-${p.member_id}-${i}`} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2 p-2.5 sm:flex-row sm:items-center">
                              <div className="flex min-w-[7.5rem] items-center gap-2">
                                <span className={`h-8 w-1 rounded-full ${p.placement === 1 ? 'bg-warn' : (p.placement ?? 9) <= 4 ? 'bg-ok' : 'bg-danger/70'}`} aria-hidden />
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-fg">{memberNameById.get(p.member_id as string)}</p>
                                  <p className={`text-xs font-black ${p.placement === 1 ? 'text-warn-ink' : (p.placement ?? 9) <= 4 ? 'text-ok-ink' : 'text-danger-ink'}`}>{p.placement ?? '-'}위</p>
                                </div>
                              </div>

                              <div className="flex min-w-0 flex-1 items-start gap-1 overflow-x-auto pb-0.5" aria-label="사용한 핵심 기물">
                                {units.map((unit, unitIndex) => (
                                  <span key={`${match.match_id}-${p.member_id}-${unit.id}-${unitIndex}`} className="flex w-9 shrink-0 flex-col items-center gap-0.5" title={`${unit.name} ${unit.tier}성`}>
                                    <span className="relative">
                                      <Image src={unit.imageUrl} alt={unit.name} width={32} height={32} className={`h-8 w-8 rounded-lg border-2 object-cover ${rarityBorderClass(unit.rarity)}`} />
                                      {unit.tier >= 2 && <span className="absolute -bottom-1 -right-1 rounded bg-panel px-1 text-[8px] font-black leading-3 text-warn-ink">{unit.tier}★</span>}
                                    </span>
                                    <span className="block w-full truncate text-center text-[9px] font-semibold leading-3 text-muted">{unit.name}</span>
                                  </span>
                                ))}
                                {units.length === 0 && <span className="text-[11px] text-faint">기물 정보 없음</span>}
                              </div>

                              <div className="flex flex-wrap gap-1 sm:max-w-[15rem] sm:justify-end">
                                {traits.map((trait) => (
                                  <span key={`${match.match_id}-${p.member_id}-${trait.name}`} className="rounded-md border border-brand/20 bg-brand/10 px-1.5 py-1 text-[10px] font-bold text-brand-ink">
                                    {trait.name}{trait.units > 0 ? ` ${trait.units}` : ''}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )
                        })}
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
        <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {NAV_CARDS.map((card) => (
            <Link key={card.href} href={card.href} className={`${CARD_HOVER} group flex min-h-[72px] items-center gap-3 px-4 py-3.5`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-2 text-lg leading-none transition-colors group-hover:border-brand/20 group-hover:bg-brand/10" aria-hidden>
                {card.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-fg">{card.title}</span>
                <span className="block truncate text-xs text-subtle">{card.description}</span>
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  )
}
