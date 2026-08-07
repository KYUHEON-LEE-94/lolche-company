import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { claimDailyLogin } from '@/lib/points/claims'

export const dynamic = 'force-dynamic'

const H = { 'Cache-Control': 'private, no-store' }

// 사이트 출석: 승인 멤버가 방문하면 하루 1회 5P 지급(중복은 RPC가 날짜로 dedup).
// claimDailyLogin 은 함수 부재/에러를 안전하게 흡수하므로 실패해도 200 을 반환한다.
export async function POST() {
  const mine = await getMyMember()
  if (!mine.ok || !mine.member || mine.member.status !== 'approved') {
    return NextResponse.json({ ok: false }, { headers: H })
  }
  await claimDailyLogin(mine.member.id)
  return NextResponse.json({ ok: true }, { headers: H })
}
