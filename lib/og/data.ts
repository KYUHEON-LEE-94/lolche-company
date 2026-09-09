import 'server-only'
import { supabase } from '@/lib/supabase'
import { compareRank } from '@/lib/constants/tierOrder'
import { isApexTier } from '@/lib/tft/tierScore'

export type OgSeason = { season_name: string; set_number: number }

export type OgRankRow = { rank: number; name: string; tier: string; detail: string }

const TIER_KR: Record<string, string> = {
  CHALLENGER: '챌린저', GRANDMASTER: '그랜드마스터', MASTER: '마스터',
  DIAMOND: '다이아몬드', EMERALD: '에메랄드', PLATINUM: '플래티넘',
  GOLD: '골드', SILVER: '실버', BRONZE: '브론즈', IRON: '아이언',
}

function tierLabel(tier: string | null): string {
  if (!tier) return '언랭'
  return TIER_KR[tier.toUpperCase()] ?? tier
}

function detailLabel(tier: string | null, rank: string | null, lp: number | null): string {
  const lpText = `${lp ?? 0} LP`
  if (!tier || isApexTier(tier)) return lpText
  return rank ? `${rank} · ${lpText}` : lpText
}

/** OG 표면은 인증 없는 크롤러가 보는 곳이라 최소권한(anon)만 쓴다. seasons 는 RLS A그룹(공개 select). */
export async function getOgSeason(): Promise<OgSeason | null> {
  try {
    const { data, error } = await supabase
      .from('seasons')
      .select('season_name,set_number')
      .eq('is_active', true)
      .maybeSingle()
    if (error || !data) return null
    return { season_name: data.season_name, set_number: data.set_number }
  } catch (e) {
    console.warn('[og] 시즌 조회 실패', e instanceof Error ? e.message : '오류 발생')
    return null
  }
}

type RankedMember = { name: string; tier: string | null; rank: string | null; lp: number | null }

/** 티어가 문자열이라 DB 정렬이 불가하다 (app/page.tsx 와 동일 방식). */
function toTop3(rows: RankedMember[]): OgRankRow[] {
  return [...rows]
    .sort(compareRank)
    .slice(0, 3)
    .map((row, i) => ({
      rank: i + 1,
      name: row.name,
      tier: tierLabel(row.tier),
      detail: detailLabel(row.tier, row.rank, row.lp),
    }))
}

export async function getTftTop3(): Promise<OgRankRow[]> {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('member_name,tft_tier,tft_rank,tft_league_points')
      .eq('status', 'approved')
      .not('tft_tier', 'is', null)
    if (error || !data) return []
    return toTop3(
      data.map((row) => ({
        name: row.member_name,
        tier: row.tft_tier,
        rank: row.tft_rank,
        lp: row.tft_league_points,
      })),
    )
  } catch (e) {
    console.warn('[og] TFT 랭킹 조회 실패', e instanceof Error ? e.message : '오류 발생')
    return []
  }
}

export async function getLolTop3(): Promise<OgRankRow[]> {
  try {
    const { data, error } = await supabase
      .from('members')
      .select('member_name,lol_tier,lol_rank,lol_league_points')
      .eq('status', 'approved')
      .not('lol_tier', 'is', null)
    if (error || !data) return []
    return toTop3(
      data.map((row) => ({
        name: row.member_name,
        tier: row.lol_tier,
        rank: row.lol_rank,
        lp: row.lol_league_points,
      })),
    )
  } catch (e) {
    console.warn('[og] LoL 랭킹 조회 실패', e instanceof Error ? e.message : '오류 발생')
    return []
  }
}
