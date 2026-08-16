import { NextResponse } from 'next/server'
import { getMyMember } from '@/lib/members/myMember'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { refreshMemberTitles } from '@/lib/achievements/refreshTitles'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const mine = await getMyMember()
  if (!mine.ok) return NextResponse.json({ error: mine.message }, { status: mine.status })
  if (!mine.member || mine.member.status !== 'approved') return NextResponse.json({ error: '승인된 멤버만 사용할 수 있습니다.' }, { status: 403 })
  await refreshMemberTitles(mine.member.id)
  const { data, error } = await supabaseAdmin.rpc('list_my_title_achievements', { p_member_id: mine.member.id })
  if (error) {
    if (isMissingFunctionError(error) || isMissingTableError(error)) return NextResponse.json({ migration_required: true, titles: [] })
    return NextResponse.json({ error: '칭호를 불러오지 못했습니다.' }, { status: 500 })
  }
  return NextResponse.json({ migration_required: false, titles: data ?? [] })
}
