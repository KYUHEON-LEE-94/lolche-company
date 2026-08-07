import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

const H = { 'Cache-Control': 'private, no-store' }

// 네비 상시 표시용 경량 잔액 조회. 미로그인·미승인·마이그레이션 미적용이면 balance:null →
// 클라이언트(네비 칩)는 숫자일 때만 렌더한다. 상점 전체(cosmetics)보다 가볍게 유지한다.
export async function GET() {
  const mine = await getMyMember()
  if (!mine.ok || !mine.member || mine.member.status !== 'approved') {
    return NextResponse.json({ balance: null }, { headers: H })
  }
  const [account, ledger] = await Promise.all([
    supabaseAdmin.from('point_accounts').select('balance').eq('member_id', mine.member.id).maybeSingle(),
    supabaseAdmin.from('point_ledger').select('id,amount,description,reason,created_at').eq('member_id', mine.member.id).order('created_at', { ascending: false }).limit(15),
  ])
  if (account.error) {
    if (!isMissingTableError(account.error)) console.error('[me/points] 조회 실패', account.error.message)
    return NextResponse.json({ balance: null, ledger: [] }, { headers: H })
  }
  return NextResponse.json({ balance: account.data?.balance ?? 0, ledger: ledger.data ?? [] }, { headers: H })
}
