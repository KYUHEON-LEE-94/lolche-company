import { NextRequest, NextResponse } from 'next/server'
import { getCalendarViewer } from '@/lib/calendar/viewer'
import { isRecord, parseEventInput, UUID_RE } from '@/lib/calendar/events'
import { isCheckViolation, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store' }
const COLUMNS = 'id,title,description,event_type,recurrence,event_date,event_month,event_day,is_all_day,event_time,member_id'
const ALLOWED = new Set(['title', 'description', 'event_type', 'recurrence', 'event_date', 'event_month', 'event_day', 'is_all_day', 'event_time', 'member_id'])
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: HEADERS }) }
async function context(params: Promise<{ id: string }>) {
  const { id } = await params
  if (!UUID_RE.test(id)) return { response: json({ error: '일정 ID가 올바르지 않습니다.' }, 400) }
  const auth = await getCalendarViewer()
  if (!auth.ok) return { response: json({ error: auth.message }, auth.status) }
  const existing = await supabaseAdmin.from('calendar_events').select(COLUMNS).eq('id', id).maybeSingle()
  if (existing.error) {
    if (isMissingTableError(existing.error)) return { response: json({ error: '캘린더 DB 적용이 필요합니다.', migration_required: true }, 503) }
    return { response: json({ error: '일정을 확인하지 못했습니다.' }, 500) }
  }
  if (!existing.data) return { response: json({ error: '일정을 찾을 수 없습니다.' }, 404) }
  if (!auth.viewer.isAdmin && (auth.viewer.member?.status !== 'approved' || auth.viewer.member.id !== existing.data.member_id)) return { response: json({ error: '이 일정을 변경할 권한이 없습니다.' }, 403) }
  return { id, auth, existing: existing.data }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context(params)
  if ('response' in ctx) return ctx.response
  let body: unknown
  try { body = await request.json() } catch (e) { return json({ error: e instanceof Error ? '요청 형식이 올바르지 않습니다.' : '오류 발생' }, 400) }
  if (!isRecord(body) || Object.keys(body).length === 0 || Object.keys(body).some((key) => !ALLOWED.has(key))) return json({ error: '수정할 항목이 없거나 허용되지 않은 항목이 있습니다.' }, 400)
  const merged = { ...ctx.existing, ...body, ...(!ctx.auth.viewer.isAdmin ? { member_id: ctx.existing.member_id } : {}) }
  delete merged.id
  const parsed = parseEventInput(merged)
  if (!parsed.ok) return json({ error: parsed.message }, 400)
  let memberId = ctx.auth.viewer.member?.id ?? ctx.existing.member_id
  if (ctx.auth.viewer.isAdmin) {
    memberId = parsed.value.member_id ?? ctx.existing.member_id
    const target = await supabaseAdmin.from('members').select('id').eq('id', memberId).eq('status', 'approved').maybeSingle()
    if (target.error || !target.data) return json({ error: '승인된 멤버를 선택해 주세요.' }, 400)
  }
  const { member_id: _ignored, ...input } = parsed.value
  void _ignored
  let updateQuery = supabaseAdmin.from('calendar_events').update({ ...input, member_id: memberId, updated_at: new Date().toISOString() }).eq('id', ctx.id)
  // 조회 후 쓰기 사이에 관리자가 소유자를 바꾸더라도 일반 멤버가 새 소유자의 행을 수정하지 못하게 한다.
  if (!ctx.auth.viewer.isAdmin) updateQuery = updateQuery.eq('member_id', ctx.existing.member_id)
  const result = await updateQuery.select(COLUMNS).maybeSingle()
  if (result.error) {
    if (isMissingTableError(result.error)) return json({ error: '캘린더 DB 적용이 필요합니다.', migration_required: true }, 503)
    if (isCheckViolation(result.error) || result.error.code === '23503') return json({ error: '입력값이 올바르지 않습니다.' }, 400)
    console.error('[calendar-events] 수정 실패', result.error.message)
    return json({ error: '일정을 수정하지 못했습니다.' }, 500)
  }
  if (!result.data) return json({ error: '일정이 변경되어 다시 확인이 필요합니다.' }, 409)
  return json({ event: result.data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await context(params)
  if ('response' in ctx) return ctx.response
  let deleteQuery = supabaseAdmin.from('calendar_events').delete().eq('id', ctx.id)
  // PATCH와 동일하게 일반 멤버의 삭제도 확인한 owner가 유지되는 경우에만 수행한다.
  if (!ctx.auth.viewer.isAdmin) deleteQuery = deleteQuery.eq('member_id', ctx.existing.member_id)
  const result = await deleteQuery.select('id').maybeSingle()
  if (result.error) {
    if (isMissingTableError(result.error)) return json({ error: '캘린더 DB 적용이 필요합니다.', migration_required: true }, 503)
    console.error('[calendar-events] 삭제 실패', result.error.message)
    return json({ error: '일정을 삭제하지 못했습니다.' }, 500)
  }
  if (!result.data) return json({ error: '일정이 변경되어 다시 확인이 필요합니다.' }, 409)
  return json({ ok: true })
}
