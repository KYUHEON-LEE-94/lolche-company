import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member, Season } from '@/types/supabase'
import { CARD, CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import ProfileChecklist from '@/app/components/ProfileChecklist'
import TodayMyRecord from '@/app/TodayMyRecord'
import AdminPendingNotice from '@/app/components/AdminPendingNotice'
import HomeCalendar from '@/app/components/calendar/HomeCalendar'
import DashboardRankSections, {
  type DashMover,
  type DashRankMember,
} from '@/app/DashboardRankSections'
import { compareRank } from '@/lib/constants/tierOrder'
import { isApexTier, tierScore } from '@/lib/tft/tierScore'
import { formatKstShort, gameKindLabel } from '@/lib/customGames/display'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import { resolveAvatarUrl, withAvatarColumn } from '@/lib/members/avatar'
import { getEquippedTitlesByMemberIds } from '@/lib/achievements/publicTitles'
import { fetchDiscordMemberActivity } from '@/lib/discord/memberActivity'
import { getKstTodayDate, formatDiscordVoiceDuration } from '@/lib/discord/activityHelpers'
import DashboardDiscordTop5, { type DiscordTop5Entry } from '@/app/components/ranking/DashboardDiscordTop5'

export const revalidate = 60

type DashMember = Pick<
  Member,
  | 'id'
  | 'member_name'
  | 'profile_image_path'
  | 'profile_frame_path'
  | 'discord_avatar_url'
  | 'tft_tier'
  | 'tft_rank'
  | 'tft_league_points'
  | 'tft_tier_prev'
  | 'tft_rank_prev'
  | 'tft_lp_prev'
  | 'last_synced_at'
  | 'ranking_card_effect_key'
  | 'ranking_card_bg_image'
>

type RecruitingGame = {
  id: string
  title: string
  game_kind: string | null
  game_kind_label: string | null
  scheduled_at: string | null
  capacity: number | null
}

const MEMBER_COLUMNS =
  'id,member_name,profile_image_path,profile_frame_path,ranking_card_effect_key,ranking_card_bg_image,tft_tier,tft_rank,tft_league_points,tft_tier_prev,tft_rank_prev,tft_lp_prev,last_synced_at'
const LEGACY_MEMBER_COLUMNS =
  'id,member_name,profile_image_path,profile_frame_path,tft_tier,tft_rank,tft_league_points,tft_tier_prev,tft_rank_prev,tft_lp_prev,last_synced_at'

async function fetchDashboardMembers() {
  const full = await withAvatarColumn((cols) => supabase.from('members').select(`${MEMBER_COLUMNS}${cols}`).eq('status', 'approved'))
  if (!full.error || !isMissingColumnError(full.error)) return full
  const legacy = await withAvatarColumn((cols) => supabase.from('members').select(`${LEGACY_MEMBER_COLUMNS}${cols}`).eq('status', 'approved'))
  return legacy.error ? legacy : { ...legacy, data: ((legacy.data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({ ...row, ranking_card_effect_key: null, ranking_card_bg_image: null })) }
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

/** 최근 7일(KST) Discord 음성 시간 TOP5. API 미설정/실패 시 빈 배열로 degrade. */
async function fetchWeeklyDiscordTop5(): Promise<DiscordTop5Entry[]> {
  const to = getKstTodayDate()
  const from = new Date(Date.parse(`${to}T00:00:00Z`) - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const result = await fetchDiscordMemberActivity({ from, to }, { includeUnlinked: false })
  if (result.status !== 'ready') return []
  return result.rows
    .filter((row) => row.voiceSeconds > 0)
    .slice(0, 5)
    .map((row) => ({ name: row.displayName, avatarUrl: row.avatarUrl, voiceLabel: formatDiscordVoiceDuration(row.voiceSeconds) }))
}

export default async function DashboardPage() {
  const [membersResult, seasonResult, recruiting, discordTop5] = await Promise.all([
    fetchDashboardMembers(),
    supabaseService.from('seasons').select('season_name,set_number').eq('is_active', true).maybeSingle(),
    fetchRecruiting(),
    fetchWeeklyDiscordTop5(),
  ])

  if (membersResult.error) console.error('Supabase error:', membersResult.error)

  // 이 프로젝트의 Database 제네릭은 select 결과를 추론하지 못한다(전역적으로 never).
  // app/tft/page.tsx 와 동일하게 명시 캐스팅으로 처리한다.
  const members = (membersResult.data ?? []) as unknown as DashMember[]
  const titlesByMember = await getEquippedTitlesByMemberIds(members.map((member) => member.id))
  const activeSeason = seasonResult.data as Pick<Season, 'season_name' | 'set_number'> | null

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
    discord_avatar_url: m.discord_avatar_url,
    profile_frame_path: m.profile_frame_path,
    ranking_card_effect_key: m.ranking_card_effect_key,
    ranking_card_bg_image: m.ranking_card_bg_image,
    equipped_titles: titlesByMember.get(m.id) ?? [],
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

        {/* 완료되면 null을 반환하므로 별도 grid wrapper 없이 둔다. */}
        <ProfileChecklist />

        <section className={`${CARD} mb-8 grid grid-cols-1 overflow-hidden sm:grid-cols-3`} aria-label="서비스 현황">
          {stats.map((stat) => (
            <div key={stat.label} className="min-w-0 border-b border-line px-5 py-3.5 last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0">
              <p className="text-[10px] font-black tracking-[0.18em] uppercase text-subtle">{stat.label}</p>
              <p className="mt-1 truncate text-base font-black tracking-tight text-fg" title={stat.value}>{stat.value}</p>
            </div>
          ))}
        </section>

        {/* 세션·일정 데이터는 ISR HTML과 분리된 dynamic/no-store Client Island에서만 조회한다. */}
        <HomeCalendar />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* TOP5 + 랭크 변동 통합 카드. 상세 패널 상태는 클라이언트 아일랜드가 소유한다. */}
          <DashboardRankSections leaderboard={leaderboardView} movers={moversView} />

          {/* ③ 우측 열: 모집 중 내전(압축) + Discord 주간 TOP5 를 반반으로 쌓는다. */}
          <div className="flex flex-col gap-4">
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
                <>
                  <ul className="mt-3 space-y-2">
                    {/* 우측 열을 반으로 나눠 쓰므로 대시보드에서는 최대 2건만 노출한다(나머지는 전체 보기). */}
                    {recruiting.rows.slice(0, 2).map((game) => (
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
                  {recruiting.count > 2 && (
                    <p className="mt-2 text-xs text-subtle">외 {recruiting.count - 2}건 더 모집 중</p>
                  )}
                </>
              )}
            </section>

            <DashboardDiscordTop5 entries={discordTop5} />
          </div>

        </div>
      </div>
    </main>
  )
}
