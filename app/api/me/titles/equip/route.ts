import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getMyMember } from '@/lib/members/myMember'
import { UUID_RE, isRecord } from '@/lib/calendar/events'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const mine = await getMyMember()
  if (!mine.ok) return NextResponse.json({ error: mine.message }, { status: mine.status })
  if (!mine.member || mine.member.status !== 'approved') return NextResponse.json({ error: '승인된 멤버만 사용할 수 있습니다.' }, { status: 403 })
  let body: unknown
  try { body = await req.json() } catch (e) { return NextResponse.json({ error: e instanceof Error ? '요청 형식이 올바르지 않습니다.' : '오류 발생' }, { status: 400 }) }
  if (!isRecord(body) || Object.keys(body).some((key) => key !== 'titleIds') || !Array.isArray(body.titleIds) || body.titleIds.length > 3 || body.titleIds.some((id) => typeof id !== 'string' || !UUID_RE.test(id)) || new Set(body.titleIds).size !== body.titleIds.length) return NextResponse.json({ error: '칭호 선택이 올바르지 않습니다.' }, { status: 400 })
  const { error } = await supabaseAdmin.rpc('set_my_equipped_titles', { p_member_id: mine.member.id, p_title_ids: body.titleIds })
  if (error) {
    if (isMissingFunctionError(error) || isMissingTableError(error)) return NextResponse.json({ error: '업적 기능 준비 중입니다.', migration_required: true }, { status: 503 })
    return NextResponse.json({ error: '사용할 수 없는 칭호가 포함되어 있습니다.' }, { status: 400 })
  }
  revalidatePath('/'); revalidatePath('/profile'); revalidatePath('/tft')
  return NextResponse.json({ ok: true })
}
