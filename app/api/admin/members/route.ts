import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingTableError, pickPrimaryAccount } from '@/lib/members/primaryAccount'

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

const ALLOWED_STATUS = new Set(['pending', 'approved', 'rejected'])

export async function GET(req: Request) {
  const { ok, supabase } = await requireAdmin()
  if (!ok) {
    return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })
  }

  const status = new URL(req.url).searchParams.get('status')

  let query = supabase
    .schema('public')
    .from('members')
    .select(
      'id, member_name, riot_game_name, riot_tagline, status, rejected_reason, requested_at, approved_at, created_at, last_synced_at, user_id, discord_id',
    )
    .order('created_at', { ascending: false })

  if (status) {
    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ ok: false, message: '잘못된 status 값입니다.' }, { status: 400 })
    }
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }

  const accountsByMember = await loadAccountsByMember((data ?? []).map((m) => m.id))

  const members = (data ?? []).map((m) => ({
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
    // 로그인 연결 현황: 원본 user_id/discord_id는 노출하지 않고 불리언으로만 전달
    login_linked: !!m.user_id,
    discord_registered: !!m.discord_id,
    riot_accounts: accountsByMember.get(m.id) ?? [],
  }))

  return NextResponse.json({ ok: true, members })
}
