import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingTableError, pickPrimaryAccount } from '@/lib/members/primaryAccount'
import { withAvatarColumn } from '@/lib/members/avatar'
import type { Member, MemberStatus } from '@/types/supabase'

export const dynamic = 'force-dynamic'

type AccountSummary = {
  id: string
  account_no: number
  is_primary: boolean
  riot_game_name: string
  riot_tagline: string
}

/**
 * 멤버별 라이엇 계정 목록. 대표 계정이 앞에 오도록 정렬한다.
 * 마이그레이션 미적용 환경에서는 빈 맵을 돌려주고 목록 화면은 members 캐시만 보여준다.
 */
async function loadAccountsByMember(memberIds: string[]): Promise<Map<string, AccountSummary[]>> {
  const byMember = new Map<string, AccountSummary[]>()
  if (memberIds.length === 0) return byMember

  const { data, error } = await supabaseAdmin
    .from('riot_accounts')
    .select('id, member_id, account_no, is_primary, riot_game_name, riot_tagline')
    .in('member_id', memberIds)

  if (error) {
    if (!isMissingTableError(error)) console.error('riot_accounts query error', error)
    return byMember
  }

  ;(data ?? []).forEach((row) => {
    const list = byMember.get(row.member_id) ?? []
    list.push({
      id: row.id,
      account_no: row.account_no,
      is_primary: row.is_primary,
      riot_game_name: row.riot_game_name,
      riot_tagline: row.riot_tagline,
    })
    byMember.set(row.member_id, list)
  })

  byMember.forEach((list, memberId) => {
    const primary = pickPrimaryAccount(list)
    byMember.set(
      memberId,
      [...list].sort((a, b) => {
        if (a.id === primary?.id) return -1
        if (b.id === primary?.id) return 1
        return a.account_no - b.account_no
      }),
    )
  })

  return byMember
}

const ALLOWED_STATUS = new Set<MemberStatus>(['pending', 'approved', 'rejected'])

export async function GET(req: Request) {
  const { ok, supabase } = await requireAdmin()
  if (!ok) {
    return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })
  }

  const rawStatus = new URL(req.url).searchParams.get('status')
  const status: MemberStatus | null = rawStatus && ALLOWED_STATUS.has(rawStatus as MemberStatus) ? rawStatus as MemberStatus : null

  if (rawStatus && !status) {
    return NextResponse.json({ ok: false, message: '잘못된 status 값입니다.' }, { status: 400 })
  }

  const { data, error } = await withAvatarColumn((avatarColumns) => {
    let query = supabase
      .schema('public')
      .from('members')
      .select(
        `id, member_name, riot_game_name, riot_tagline, status, rejected_reason, requested_at, approved_at, created_at, last_synced_at, user_id, discord_id, tft_tier, tft_rank, tft_league_points, tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_league_points, sync_status, last_sync_error, last_sync_finished_at${avatarColumns}`,
      )
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    return query
  })

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as Member[]
  const accountsByMember = await loadAccountsByMember(rows.map((m) => m.id))

  const members = rows.map((m) => ({
    id: m.id,
    member_name: m.member_name,
    riot_game_name: m.riot_game_name,
    riot_tagline: m.riot_tagline,
    status: m.status,
    rejected_reason: m.rejected_reason,
    requested_at: m.requested_at,
    approved_at: m.approved_at,
    created_at: m.created_at,
    last_synced_at: m.last_synced_at,
    tft_tier: m.tft_tier,
    tft_rank: m.tft_rank,
    tft_league_points: m.tft_league_points,
    tft_doubleup_tier: m.tft_doubleup_tier,
    tft_doubleup_rank: m.tft_doubleup_rank,
    tft_doubleup_league_points: m.tft_doubleup_league_points,
    sync_status: m.sync_status,
    // last_sync_error 원문은 requireAdmin 라우트라 관리자 한정 노출 → 안전
    last_sync_error: m.last_sync_error,
    last_sync_finished_at: m.last_sync_finished_at,
    // 로그인 연결 현황: 원본 user_id/discord_id는 노출하지 않고 불리언으로만 전달
    login_linked: !!m.user_id,
    discord_registered: !!m.discord_id,
    discord_avatar_url: m.discord_avatar_url ?? null,
    riot_accounts: accountsByMember.get(m.id) ?? [],
  }))

  return NextResponse.json({ ok: true, members })
}
