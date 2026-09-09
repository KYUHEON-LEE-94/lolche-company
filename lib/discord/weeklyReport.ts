import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { tierScore, isApexTier } from '@/lib/tft/tierScore'
import { compareRank } from '@/lib/constants/tierOrder'
import { DISCORD_COLOR, tierKo, type DiscordEmbed } from '@/lib/discord/notify'
import { getSiteUrl } from '@/lib/og/siteUrl'

/**
 * 주간 랭크 리포트 집계 · 임베드 빌드. ⚠ 서버 전용(service role).
 * `member_rank_history` 는 RLS B그룹(정책 0개)이라 반드시 supabaseAdmin 으로 읽는다.
 * 이 모듈은 **읽기 전용**이다 — members / member_rank_history 에 write 하지 않는다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 1000
const MAX_PAGES = 10
/** 솔로랭크 1100 · 더블업 1160 */
const RANKED_QUEUE_IDS = [1100, 1160]

export type WeeklyWindow = {
  weekKey: string
  label: string
  weekStartIso: string
  weekEndIso: string
}

export type MovementEntry = {
  name: string
  delta: number
  fromLabel: string
  toLabel: string
}

export type PlayEntry = {
  name: string
  total: number
  solo: number
  doubleup: number
}

export type RankEntry = {
  name: string
  rankLabel: string
}

export type WeeklyReportData = {
  window: WeeklyWindow
  risers: MovementEntry[]
  fallers: MovementEntry[]
  plays: PlayEntry[]
  top3: RankEntry[]
  hasAny: boolean
}

function formatUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/**
 * 지난 주(직전 월요일 00:00 KST ~ 이번 주 월요일 00:00 KST) 윈도우.
 * 한국은 서머타임이 없어 고정 +9h 오프셋이 안전하다(로컬 타임존 해석 금지).
 * 월요일 09/12/15시 재시도가 전부 같은 weekKey 를 만들어 멱등 키가 된다.
 */
export function getKstWeekWindow(now: Date = new Date()): WeeklyWindow {
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS)
  // "KST 벽시계 날짜 00:00" 을 UTC 밀리초로 표현한 값(아직 실제 instant 가 아니다).
  const todayWall = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
  const daysSinceMonday = (kstNow.getUTCDay() + 6) % 7
  const thisMondayWall = todayWall - daysSinceMonday * DAY_MS
  const startWall = thisMondayWall - 7 * DAY_MS
  const endWall = thisMondayWall

  const startDate = new Date(startWall)
  const lastDate = new Date(endWall - DAY_MS)
  return {
    weekKey: formatUtcDate(startDate),
    label: `${startDate.getUTCMonth() + 1}/${startDate.getUTCDate()}~${lastDate.getUTCMonth() + 1}/${lastDate.getUTCDate()}`,
    weekStartIso: new Date(startWall - KST_OFFSET_MS).toISOString(),
    weekEndIso: new Date(endWall - KST_OFFSET_MS).toISOString(),
  }
}

type ApprovedMember = {
  id: string
  member_name: string
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
}

type HistoryRow = {
  member_id: string
  tft_tier: string | null
  tft_rank: string | null
  tft_lp: number | null
  season_id: number | null
  recorded_at: string
}

function rankLabel(tier: string | null, rank: string | null, lp: number | null): string {
  if (!tier) return '언랭'
  const base = isApexTier(tier) ? tierKo(tier) : `${tierKo(tier)} ${rank ?? ''}`.trim()
  return lp === null ? base : `${base} · ${lp} LP`
}

/** 멤버명은 사용자 입력이다. 디스코드 마크다운으로 임베드 레이아웃이 망가지지 않게 이스케이프한다. */
export function escapeDiscordMarkdown(value: string): string {
  return value.replace(/([\\*_~`|>])/g, '\\$1')
}

/**
 * 멤버별 baseline(주 시작 이전 최신 1행)을 한 번에 모은다.
 * recorded_at desc 정렬이라 각 멤버의 첫 행이 baseline 이다. 전원 확보되면 조기 종료한다.
 */
async function fetchBaselines(memberIds: string[], weekStartIso: string): Promise<Map<string, HistoryRow>> {
  const map = new Map<string, HistoryRow>()
  if (memberIds.length === 0) return map

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin
      .from('member_rank_history')
      .select('member_id,tft_tier,tft_rank,tft_lp,season_id,recorded_at')
      .in('member_id', memberIds)
      .lt('recorded_at', weekStartIso)
      .order('recorded_at', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const rows = (data ?? []) as HistoryRow[]
    for (const row of rows) {
      if (!map.has(row.member_id)) map.set(row.member_id, row)
    }
    if (rows.length < PAGE_SIZE || map.size >= memberIds.length) break
  }
  return map
}

/** 지난 주 랭크 매치 판수(솔로/더블업). member_id 가 없는 참가자 행은 제외된다. */
async function fetchPlayCounts(weekStartIso: string, weekEndIso: string): Promise<Map<string, { solo: number; doubleup: number }>> {
  const map = new Map<string, { solo: number; doubleup: number }>()

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin
      .from('tft_match_participants')
      .select('member_id, tft_matches!inner(game_datetime, queue_id)')
      .gte('tft_matches.game_datetime', weekStartIso)
      .lt('tft_matches.game_datetime', weekEndIso)
      .in('tft_matches.queue_id', RANKED_QUEUE_IDS)
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as { member_id: string | null; tft_matches: { queue_id: number } }[]
    for (const row of rows) {
      if (!row.member_id) continue
      const entry = map.get(row.member_id) ?? { solo: 0, doubleup: 0 }
      if (row.tft_matches.queue_id === 1100) entry.solo += 1
      else if (row.tft_matches.queue_id === 1160) entry.doubleup += 1
      map.set(row.member_id, entry)
    }
    if (rows.length < PAGE_SIZE) break
  }
  return map
}

export async function collectWeeklyReport(now: Date = new Date()): Promise<WeeklyReportData> {
  const weekWindow = getKstWeekWindow(now)

  const [{ data: season }, { data: memberRows, error: memberError }] = await Promise.all([
    supabaseAdmin.from('seasons').select('id').eq('is_active', true).maybeSingle(),
    supabaseAdmin
      .from('members')
      .select('id,member_name,tft_tier,tft_rank,tft_league_points')
      // 미승인 멤버는 어느 섹션에도 노출하지 않는다(CLAUDE.md 노출 필터 규칙).
      .eq('status', 'approved'),
  ])
  if (memberError) throw new Error(memberError.message)

  const members = (memberRows ?? []) as ApprovedMember[]
  const activeSeasonId = season?.id ?? null
  const memberIds = members.map((m) => m.id)

  const [baselines, playCounts] = await Promise.all([
    fetchBaselines(memberIds, weekWindow.weekStartIso),
    fetchPlayCounts(weekWindow.weekStartIso, weekWindow.weekEndIso),
  ])

  const movements: MovementEntry[] = []
  for (const member of members) {
    const baseline = baselines.get(member.id)
    if (!baseline) continue // baseline 없음 = 신규. 상승/하락에서 제외.
    // 시즌 전환 시 랭크가 초기화되므로 다른 시즌의 baseline 과는 비교하지 않는다.
    if (activeSeasonId !== null && baseline.season_id !== activeSeasonId) continue

    const before = tierScore(baseline.tft_tier, baseline.tft_rank, baseline.tft_lp)
    const after = tierScore(member.tft_tier, member.tft_rank, member.tft_league_points)
    if (before < 0 || after < 0) continue // 언랭/배치중
    const delta = after - before
    if (delta === 0) continue

    movements.push({
      name: member.member_name,
      delta,
      fromLabel: rankLabelShort(baseline.tft_tier, baseline.tft_rank),
      toLabel: rankLabelShort(member.tft_tier, member.tft_rank),
    })
  }

  const risers = movements.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 3)
  const fallers = movements.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 1)

  const nameById = new Map(members.map((m) => [m.id, m.member_name]))
  const plays: PlayEntry[] = [...playCounts.entries()]
    .filter(([memberId]) => nameById.has(memberId))
    .map(([memberId, counts]) => ({
      name: nameById.get(memberId) as string,
      total: counts.solo + counts.doubleup,
      solo: counts.solo,
      doubleup: counts.doubleup,
    }))
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3)

  const top3: RankEntry[] = members
    .filter((m) => !!m.tft_tier)
    .sort((a, b) =>
      compareRank(
        { tier: a.tft_tier, rank: a.tft_rank, lp: a.tft_league_points },
        { tier: b.tft_tier, rank: b.tft_rank, lp: b.tft_league_points },
      ),
    )
    .slice(0, 3)
    .map((m) => ({ name: m.member_name, rankLabel: rankLabel(m.tft_tier, m.tft_rank, m.tft_league_points) }))

  return {
    window: weekWindow,
    risers,
    fallers,
    plays,
    top3,
    hasAny: risers.length > 0 || fallers.length > 0 || plays.length > 0 || top3.length > 0,
  }
}

/** LP 를 뺀 짧은 티어 표기(변동 화살표용). */
function rankLabelShort(tier: string | null, rank: string | null): string {
  if (!tier) return '언랭'
  return isApexTier(tier) ? tierKo(tier) : `${tierKo(tier)} ${rank ?? ''}`.trim()
}

const MEDALS = ['🥇', '🥈', '🥉']
const FIELD_LIMIT = 1024

function truncate(value: string): string {
  return value.length <= FIELD_LIMIT ? value : `${value.slice(0, FIELD_LIMIT - 1)}…`
}

/** 하락 필드는 분위기 이슈 시 재배포 없이 끌 수 있게 env 로 제어한다. */
function includeDownField(): boolean {
  return process.env.WEEKLY_REPORT_INCLUDE_DOWN !== 'false'
}

export function buildWeeklyReportEmbed(data: WeeklyReportData): DiscordEmbed {
  const fields: { name: string; value: string }[] = []

  fields.push({
    name: '🚀 상승왕 TOP3',
    value: truncate(
      data.risers.length > 0
        ? data.risers
            .map((r, i) => `${MEDALS[i]} **${escapeDiscordMarkdown(r.name)}** +${r.delta}점 · ${r.fromLabel} → ${r.toLabel}`)
            .join('\n')
        : '이번 주는 조용했어요. 다음 주엔 누가 치고 올라올까요? 👀',
    ),
  })

  if (includeDownField() && data.fallers.length > 0) {
    fields.push({
      name: '📉 하락왕',
      value: truncate(
        data.fallers
          .map((f) => `**${escapeDiscordMarkdown(f.name)}** ${f.delta}점 · ${f.fromLabel} → ${f.toLabel}`)
          .join('\n'),
      ),
    })
  }

  fields.push({
    name: '🎮 최다 플레이 TOP3',
    value: truncate(
      data.plays.length > 0
        ? data.plays
            .map((p, i) => {
              const detail = [p.solo > 0 ? `솔로 ${p.solo}` : null, p.doubleup > 0 ? `더블업 ${p.doubleup}` : null]
                .filter(Boolean)
                .join(' · ')
              return `${MEDALS[i]} **${escapeDiscordMarkdown(p.name)}** ${p.total}판${detail ? ` (${detail})` : ''}`
            })
            .join('\n')
        : '이번 주 기록된 판이 없어요. 다들 잠수 중? 🤿',
    ),
  })

  fields.push({
    name: '🏆 현재 TOP3',
    value: truncate(
      data.top3.length > 0
        ? data.top3.map((t, i) => `${MEDALS[i]} **${escapeDiscordMarkdown(t.name)}** ${t.rankLabel}`).join('\n')
        : '아직 랭크가 집계된 멤버가 없어요.',
    ),
  })

  return {
    title: `📊 이번 주 롤체 리포트 (${data.window.label})`,
    url: new URL('tft', getSiteUrl()).toString(),
    color: DISCORD_COLOR.tft,
    description: '지난 한 주 롤체컴퍼니 랭크 요약이에요. 이번 주도 화이팅! 🔥\n_판수는 동기화된 전적 기준이에요._',
    fields,
    timestamp: data.window.weekEndIso,
  }
}
