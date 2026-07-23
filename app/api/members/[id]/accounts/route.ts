import { NextResponse } from 'next/server'
import { isApprovedMember } from '@/lib/members/approved'
import {
  RIOT_ACCOUNTS_MIGRATION_MESSAGE,
  listRiotAccounts,
  pickPrimaryAccount,
} from '@/lib/members/primaryAccount'
import type { RiotAccount } from '@/types/supabase'

type Ctx = { params: Promise<{ id: string }> }

/**
 * 공개 응답 화이트리스트.
 *
 * ⚠ `riot_puuid` / `lol_puuid` / `member_id` 는 절대 내보내지 않는다.
 * PUUID 는 Riot API 조회 키라 노출되면 임의의 제3자가 이 멤버의 전적을 긁을 수 있다.
 */
function toPublicAccount(a: RiotAccount, primaryId: string | null) {
  return {
    id: a.id,
    account_no: a.account_no,
    // "대표 없음"이 관측되지 않도록 저장값이 아니라 파생 결과를 내보낸다.
    is_primary: a.id === primaryId,
    riot_game_name: a.riot_game_name,
    riot_tagline: a.riot_tagline,
    synced: !!a.riot_puuid,
    tft_tier: a.tft_tier,
    tft_rank: a.tft_rank,
    tft_league_points: a.tft_league_points,
    tft_wins: a.tft_wins,
    tft_losses: a.tft_losses,
    tft_doubleup_tier: a.tft_doubleup_tier,
    tft_doubleup_rank: a.tft_doubleup_rank,
    tft_doubleup_league_points: a.tft_doubleup_league_points,
    tft_doubleup_wins: a.tft_doubleup_wins,
    tft_doubleup_losses: a.tft_doubleup_losses,
    last_synced_at: a.last_synced_at,
  }
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id: memberId } = await ctx.params

  // 미승인 멤버의 존재를 알리지 않기 위해 403 이 아니라 404.
  if (!(await isApprovedMember(memberId))) {
    return NextResponse.json({ error: '찾을 수 없습니다.' }, { status: 404 })
  }

  const listed = await listRiotAccounts(memberId)
  if (!listed.ok) {
    // 마이그레이션 미적용은 장애가 아니다. 빈 목록 + 안내로 degrade.
    if (listed.missingTable) {
      return NextResponse.json({
        accounts: [],
        primary_account_id: null,
        migration_required: true,
        message: RIOT_ACCOUNTS_MIGRATION_MESSAGE,
      })
    }
    return NextResponse.json({ error: listed.message }, { status: 500 })
  }

  const primary = pickPrimaryAccount(listed.accounts)
  const sorted = [...listed.accounts].sort((a, b) => {
    if (a.id === primary?.id) return -1
    if (b.id === primary?.id) return 1
    return a.account_no - b.account_no
  })

  return NextResponse.json({
    primary_account_id: primary?.id ?? null,
    accounts: sorted.map((a) => toPublicAccount(a, primary?.id ?? null)),
  })
}
