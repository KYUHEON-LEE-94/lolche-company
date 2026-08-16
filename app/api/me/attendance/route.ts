import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { claimDailyLogin } from '@/lib/points/claims'
import { getCurrentUser } from '@/lib/supabase/route'
import { getDiscordAvatarUrl } from '@/lib/auth/discord'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { refreshMemberTitles } from '@/lib/achievements/refreshTitles'

export const dynamic = 'force-dynamic'

const H = { 'Cache-Control': 'private, no-store' }

// 사이트 출석: 승인 멤버가 방문하면 하루 1회 5P(RPC가 날짜로 dedup).
// + 디스코드 아바타 자가치유: 콜백(로그인 시)만으로는 세션 유지 중 아바타가 낡거나
//   과거/사전등록/병합으로 연결된 멤버가 null 로 남는다. 방문마다 세션 아바타로 갱신한다.
export async function POST() {
  const mine = await getMyMember()
  if (!mine.ok || !mine.member || mine.member.status !== 'approved') {
    return NextResponse.json({ ok: false }, { headers: H })
  }
  const memberId = mine.member.id
  const awarded = await claimDailyLogin(memberId)
  if (awarded) await refreshMemberTitles(memberId)

  // 세션 소유 행(members.id = 세션에서 해석한 내 멤버)에만 쓴다 — 탈취 방지.
  const user = await getCurrentUser()
  const avatarUrl = user ? getDiscordAvatarUrl(user) : null
  if (avatarUrl) {
    const { error } = await supabaseAdmin.from('members').update({ discord_avatar_url: avatarUrl }).eq('id', memberId)
    if (error && !isMissingColumnError(error)) console.error('[me/attendance] 아바타 갱신 실패', error.message)
  }
  return NextResponse.json({ ok: true }, { headers: H })
}
