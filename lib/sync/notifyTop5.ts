import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { compareRank } from '@/lib/constants/tierOrder'
import { isApexTier } from '@/lib/tft/tierScore'
import { notifyTop5Entry } from '@/lib/discord/notify'

type Row = {
  id: string
  member_name: string
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_tier_prev: string | null
  tft_rank_prev: string | null
  tft_lp_prev: number | null
}

function label(tier: string | null, rank: string | null, lp: number | null): string {
  if (!tier) return '언랭'
  const div = rank && !isApexTier(tier) ? ` ${rank}` : ''
  return `${tier}${div} · ${lp ?? 0}LP`
}

/**
 * 동기화 라운드 완료 후, 롤체 랭킹 TOP 5 에 '새로' 진입한 멤버를 디스코드로 알린다.
 * 현재 랭킹(tft_*)과 직전 랭킹(tft_*_prev)의 상위 5를 비교해 신규 진입만 추린다.
 * - 직전 top5 에 이미 있던 멤버는 재알림하지 않는다(prev 로 자연 dedup).
 * - 초기 채우기 스팸 방지: 랭크 보유자가 5명 미만이면 아무것도 하지 않는다.
 * - 실패해도 동기화 자체를 막지 않도록 호출부에서 감싸 쓴다.
 */
export async function notifyTop5EntriesIfAny(): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from('members')
    .select('id,member_name,tft_tier,tft_rank,tft_league_points,tft_tier_prev,tft_rank_prev,tft_lp_prev')
    .eq('status', 'approved')
    .not('tft_tier', 'is', null)
  if (error || !data) return
  const rows = data as unknown as Row[]
  const prevRows = rows.filter((r) => r.tft_tier_prev)
  if (rows.length < 5 || prevRows.length < 5) return

  const currentTop5 = [...rows]
    .sort((a, b) => compareRank(
      { tier: a.tft_tier, rank: a.tft_rank, lp: a.tft_league_points },
      { tier: b.tft_tier, rank: b.tft_rank, lp: b.tft_league_points },
    ))
    .slice(0, 5)
  const prevTop5Ids = new Set(
    [...prevRows]
      .sort((a, b) => compareRank(
        { tier: a.tft_tier_prev, rank: a.tft_rank_prev, lp: a.tft_lp_prev },
        { tier: b.tft_tier_prev, rank: b.tft_rank_prev, lp: b.tft_lp_prev },
      ))
      .slice(0, 5)
      .map((r) => r.id),
  )

  const entrants = currentTop5
    .map((r, i) => ({ r, pos: i + 1 }))
    .filter(({ r }) => !prevTop5Ids.has(r.id))
  if (entrants.length === 0) return

  await notifyTop5Entry(entrants.map(({ r, pos }) => ({
    name: r.member_name,
    rank: pos,
    rankLabel: label(r.tft_tier, r.tft_rank, r.tft_league_points),
  })))
}
