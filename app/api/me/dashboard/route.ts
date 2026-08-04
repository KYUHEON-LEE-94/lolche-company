import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { withAvatarColumn, resolveAvatarUrl } from '@/lib/members/avatar'
import { compareRank } from '@/lib/constants/tierOrder'
import { LOL_ENABLED } from '@/lib/constants/features'
import { isApexTier, tierScore } from '@/lib/tft/tierScore'

export const dynamic = 'force-dynamic'

type RankRow = {
  id: string
  member_name: string
  discord_avatar_url?: string | null
  last_synced_at: string | null
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_tier_prev: string | null
  tft_rank_prev: string | null
  tft_lp_prev: number | null
  lol_tier: string | null
  lol_rank: string | null
  lol_league_points: number | null
}

type MatchRow = {
  match_id: string
  game_datetime: string | null
  tft_match_participants: Array<{ placement: number | null }>
}

type HistoryRow = {
  tft_tier: string | null
  tft_rank: string | null
  tft_lp: number | null
}

const MEMBER_COLUMNS =
  'id,member_name,last_synced_at,tft_tier,tft_rank,tft_league_points,tft_tier_prev,tft_rank_prev,tft_lp_prev,lol_tier,lol_rank,lol_league_points'

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

function rankLabel(tier: string | null, rank: string | null, lp: number | null) {
  if (!tier) return '언랭'
  const division = rank && !isApexTier(tier) ? ` ${rank}` : ''
  return `${titleCase(tier)}${division} ${lp ?? 0}LP`
}

function positionOf(rows: RankRow[], memberId: string, game: 'tft' | 'lol') {
  const ranked = rows
    .filter((row) => (game === 'tft' ? row.tft_tier : row.lol_tier))
    .sort((a, b) => compareRank(
      game === 'tft'
        ? { tier: a.tft_tier, rank: a.tft_rank, lp: a.tft_league_points }
        : { tier: a.lol_tier, rank: a.lol_rank, lp: a.lol_league_points },
      game === 'tft'
        ? { tier: b.tft_tier, rank: b.tft_rank, lp: b.tft_league_points }
        : { tier: b.lol_tier, rank: b.lol_rank, lp: b.lol_league_points },
    ))
  const index = ranked.findIndex((row) => row.id === memberId)
  return index === -1 ? null : index + 1
}

export async function GET() {
  const mine = await getMyMember()
  if (!mine.ok) return NextResponse.json({ error: mine.message }, { status: mine.status })
  if (!mine.member) return NextResponse.json({ state: 'no_member' })
  if (mine.member.status !== 'approved') return NextResponse.json({ state: 'not_approved' })

  const memberId = mine.member.id
  const [membersResult, seasonResult, matchesResult] = await Promise.all([
    withAvatarColumn((avatarColumns) =>
      supabaseAdmin.from('members').select(`${MEMBER_COLUMNS}${avatarColumns}`).eq('status', 'approved'),
    ),
    supabaseAdmin.from('seasons').select('id').eq('is_active', true).maybeSingle(),
    supabaseAdmin
      .from('tft_matches')
      .select('match_id,game_datetime,tft_match_participants!inner(placement)')
      .eq('tft_match_participants.member_id', memberId)
      .eq('queue_id', 1100)
      .order('game_datetime', { ascending: false })
      .limit(5),
  ])

  if (membersResult.error || seasonResult.error || matchesResult.error) {
    const error = membersResult.error ?? seasonResult.error ?? matchesResult.error
    return NextResponse.json({ error: error?.message ?? '기록을 불러오지 못했습니다.' }, { status: 500 })
  }

  const members = (membersResult.data ?? []) as unknown as RankRow[]
  const me = members.find((row) => row.id === memberId)
  if (!me) return NextResponse.json({ state: 'not_approved' })

  let weeklyBest: { label: string; score: number } | null = null
  const activeSeason = seasonResult.data as { id: string } | null
  if (activeSeason) {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const historyResult = await supabaseAdmin
      .from('member_rank_history')
      .select('tft_tier,tft_rank,tft_lp')
      .eq('member_id', memberId)
      .eq('season_id', activeSeason.id)
      .gte('recorded_at', since)

    if (historyResult.error) {
      return NextResponse.json({ error: historyResult.error.message }, { status: 500 })
    }
    const history = (historyResult.data ?? []) as unknown as HistoryRow[]
    for (const row of history) {
      const score = tierScore(row.tft_tier, row.tft_rank, row.tft_lp)
      if (score >= 0 && (!weeklyBest || score > weeklyBest.score)) {
        weeklyBest = { score, label: rankLabel(row.tft_tier, row.tft_rank, row.tft_lp) }
      }
    }
  }

  const currentScore = tierScore(me.tft_tier, me.tft_rank, me.tft_league_points)
  const previousScore = tierScore(me.tft_tier_prev, me.tft_rank_prev, me.tft_lp_prev)
  const delta = currentScore >= 0 && previousScore >= 0 ? currentScore - previousScore : null
  const matches = (matchesResult.data ?? []) as unknown as MatchRow[]

  return NextResponse.json({
    state: 'ready',
    member: {
      id: me.id,
      memberName: me.member_name,
      avatarUrl: resolveAvatarUrl(me),
      lastSyncedAt: me.last_synced_at,
    },
    tft: {
      position: positionOf(members, memberId, 'tft'),
      label: rankLabel(me.tft_tier, me.tft_rank, me.tft_league_points),
      tier: me.tft_tier,
      rank: me.tft_rank,
      lp: me.tft_league_points,
      delta,
      weeklyBest: weeklyBest?.label ?? null,
    },
    lol: LOL_ENABLED
      ? {
          position: positionOf(members, memberId, 'lol'),
          label: rankLabel(me.lol_tier, me.lol_rank, me.lol_league_points),
        }
      : null,
    recentMatches: matches.map((match) => ({
      id: match.match_id,
      playedAt: match.game_datetime,
      placement: match.tft_match_participants[0]?.placement ?? null,
    })),
  })
}
