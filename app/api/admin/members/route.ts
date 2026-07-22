import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'

export const dynamic = 'force-dynamic'

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
  }))

  return NextResponse.json({ ok: true, members })
}
