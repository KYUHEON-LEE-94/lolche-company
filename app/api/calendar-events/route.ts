import { NextRequest, NextResponse } from 'next/server'
import { getCalendarViewer } from '@/lib/calendar/viewer'
import { daysInMonth, isRecord, parseEventInput } from '@/lib/calendar/events'
import { isCheckViolation, isMissingColumnError, isMissingTableError } from '@/lib/db/pgErrors'
import { gameKindLabel, lolModeLabel } from '@/lib/customGames/display'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store' }
const SELECT = 'id,title,description,event_type,recurrence,event_date,event_month,event_day,is_all_day,event_time,member_id,members!inner(member_name)'
type EventView = Record<string, unknown> & { id: string; title: string; event_day: number; event_time: string | null; member_id: string; member_name: string }
type SystemEventView = { source: 'system'; system_type: 'tft_patch_note' | 'steam_deal'; id: string; title: string; description: string | null; event_day: number; event_time: string | null; href: string; can_manage: false }
type SeasonEndView = { source: 'season_end'; id: string; title: string; event_day: number; event_time: string | null; href: string; can_manage: false }

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: HEADERS }) }
function parseInteger(value: string | null, min: number, max: number): number | null {
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null
}
function dateString(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`
}
function kstBoundaryIso(year: number, month: number) {
  return new Date(`${dateString(year, month, 1)}T00:00:00+09:00`).toISOString()
}
function customGameView(value: unknown) {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.scheduled_at !== 'string') return null
  const date = new Date(value.scheduled_at)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  const gameKind = typeof value.game_kind === 'string' ? value.game_kind : null
  const gameLabel = gameKind === 'lol' ? `롤 · ${lolModeLabel(typeof value.lol_mode === 'string' ? value.lol_mode : null) || '협곡'}` : gameKindLabel(gameKind, typeof value.game_kind_label === 'string' ? value.game_kind_label : null)
  return { source: 'custom_game' as const, id: value.id, title: value.title, event_day: Number(part('day')), scheduled_at: value.scheduled_at, event_time: `${part('hour')}:${part('minute')}:00`, status: typeof value.status === 'string' ? value.status : '', game_label: gameLabel, href: `/custom-games/${value.id}`, can_manage: false }
}
function systemEventView(value: unknown): SystemEventView | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.event_date !== 'string' || typeof value.href !== 'string') return null
  if ((value.source !== 'tft_patch_note' && value.source !== 'steam_deal') || (value.description !== null && typeof value.description !== 'string') || (value.event_time !== null && typeof value.event_time !== 'string')) return null
  const day = Number(value.event_date.slice(8, 10))
  if (!Number.isInteger(day) || day < 1 || day > 31) return null
  return { source: 'system', system_type: value.source, id: value.id, title: value.title, description: value.description, event_day: day, event_time: value.event_time, href: value.href, can_manage: false }
}
function seasonEndView(value: unknown, year: number, month: number): SeasonEndView | null {
  if (!isRecord(value) || typeof value.id !== 'number' || typeof value.season_name !== 'string' || typeof value.scheduled_end_at !== 'string') return null
  const date = new Date(value.scheduled_end_at)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  if (Number(part('year')) !== year || Number(part('month')) !== month) return null
  return { source: 'season_end', id: `season-end-${value.id}`, title: `${value.season_name} 시즌 종료 예정`, event_day: Number(part('day')), event_time: `${part('hour')}:${part('minute')}:00`, href: '/tft', can_manage: false }
}
function rowView(value: unknown): EventView | null {
  if (!isRecord(value)) return null
  if (typeof value.id !== 'string' || typeof value.title !== 'string' || typeof value.event_day !== 'number' || typeof value.member_id !== 'string' || (value.event_time !== null && typeof value.event_time !== 'string')) return null
  const relation = value.members
  const memberName = isRecord(relation) && typeof relation.member_name === 'string' ? relation.member_name : ''
  const { members: _members, ...event } = value
  void _members
  return { ...event, id: value.id, title: value.title, event_day: value.event_day, event_time: value.event_time, member_id: value.member_id, member_name: memberName }
}

export async function GET(request: NextRequest) {
  const auth = await getCalendarViewer()
  if (!auth.ok) return json({ error: auth.message }, auth.status)
  const year = parseInteger(request.nextUrl.searchParams.get('year'), 2000, 2100)
  const month = parseInteger(request.nextUrl.searchParams.get('month'), 1, 12)
  if (year === null || month === null) return json({ error: '조회 연월이 올바르지 않습니다.' }, 400)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const oneTime = supabaseAdmin.from('calendar_events').select(SELECT).eq('recurrence', 'none').gte('event_date', dateString(year, month, 1)).lt('event_date', dateString(nextYear, nextMonth, 1))
  const yearly = supabaseAdmin.from('calendar_events').select(SELECT).eq('recurrence', 'yearly').eq('event_month', month)
  const customGames = supabaseAdmin.from('custom_games').select('id,title,status,game_kind,game_kind_label,lol_mode,scheduled_at,host_member_id').neq('status', 'cancelled').gte('scheduled_at', kstBoundaryIso(year, month)).lt('scheduled_at', kstBoundaryIso(nextYear, nextMonth))
  const systemEvents = supabaseAdmin.from('calendar_system_events').select('id,source,title,description,href,event_date,event_time').gte('event_date', dateString(year, month, 1)).lt('event_date', dateString(nextYear, nextMonth, 1))
  const activeSeason = supabaseAdmin.from('seasons').select('id,season_name,scheduled_end_at').eq('is_active', true).maybeSingle()
  const memberOptions = auth.viewer.isAdmin
    ? supabaseAdmin.from('members').select('id,member_name').eq('status', 'approved').order('member_name')
    : Promise.resolve({ data: null, error: null })
  const [onceResult, yearlyResult, customResult, systemResult, seasonResult, memberResult] = await Promise.all([oneTime, yearly, customGames, systemEvents, activeSeason, memberOptions])
  const permissions = { isAdmin: auth.viewer.isAdmin, canCreate: auth.viewer.isAdmin || auth.viewer.member?.status === 'approved', canCreateGame: auth.viewer.member?.status === 'approved', viewerMemberId: auth.viewer.member?.id ?? null }
  const calendarError = onceResult.error ?? yearlyResult.error
  const migrationRequired = !!calendarError && (isMissingTableError(calendarError) || isMissingColumnError(calendarError))
  if (calendarError && !migrationRequired) {
    console.error('[calendar-events] 멤버 일정 조회 실패', calendarError.message)
    return json({ error: '일정을 불러오지 못했습니다.' }, 500)
  }
  if (memberResult.error) {
    console.error('[calendar-events] 멤버 옵션 조회 실패', memberResult.error.message)
    return json({ error: '일정을 불러오지 못했습니다.' }, 500)
  }
  if (customResult.error && !isMissingColumnError(customResult.error)) console.error('[calendar-events] 내전 일정 조회 실패', customResult.error.message)
  if (systemResult.error && !isMissingTableError(systemResult.error)) console.error('[calendar-events] 시스템 일정 조회 실패', systemResult.error.message)
  if (seasonResult.error && !isMissingColumnError(seasonResult.error)) console.error('[calendar-events] 시즌 종료 예정 조회 실패', seasonResult.error.message)
  const maxDay = daysInMonth(year, month)
  const calendarEvents = migrationRequired ? [] : [...(onceResult.data ?? []), ...(yearlyResult.data ?? [])]
    .map(rowView).filter((row): row is NonNullable<ReturnType<typeof rowView>> => row !== null && typeof row.event_day === 'number' && row.event_day <= maxDay)
    .map((row) => ({ ...row, source: 'calendar' as const, can_manage: auth.viewer.isAdmin || auth.viewer.member?.id === row.member_id }))
  const gameEvents = customResult.error ? [] : (customResult.data ?? []).map(customGameView).filter((row): row is NonNullable<ReturnType<typeof customGameView>> => row !== null)
  const newsEvents = systemResult.error ? [] : (systemResult.data ?? []).map(systemEventView).filter((row): row is SystemEventView => row !== null)
  const seasonEvent = seasonResult.error ? null : seasonEndView(seasonResult.data, year, month)
  const events = [...calendarEvents, ...gameEvents, ...newsEvents, ...(seasonEvent ? [seasonEvent] : [])].sort((a, b) => Number(a.event_day) - Number(b.event_day) || String(a.event_time ?? '').localeCompare(String(b.event_time ?? '')) || String(a.title).localeCompare(String(b.title), 'ko') || String(a.id).localeCompare(String(b.id)))
  return json({ events, memberOptions: auth.viewer.isAdmin ? memberResult.data ?? [] : [], permissions, migration_required: migrationRequired })
}

export async function POST(request: NextRequest) {
  const auth = await getCalendarViewer()
  if (!auth.ok) return json({ error: auth.message }, auth.status)
  if (!auth.viewer.isAdmin && auth.viewer.member?.status !== 'approved') return json({ error: '승인된 멤버만 일정을 등록할 수 있습니다.' }, 403)
  let body: unknown
  try { body = await request.json() } catch (e) { return json({ error: e instanceof Error ? '요청 형식이 올바르지 않습니다.' : '오류 발생' }, 400) }
  const safeBody = !auth.viewer.isAdmin && isRecord(body) ? { ...body, member_id: undefined } : body
  const parsed = parseEventInput(safeBody)
  if (!parsed.ok) return json({ error: parsed.message }, 400)
  let memberId = auth.viewer.member?.id ?? ''
  if (auth.viewer.isAdmin) {
    if (!parsed.value.member_id) return json({ error: '멤버를 선택해 주세요.' }, 400)
    const target = await supabaseAdmin.from('members').select('id').eq('id', parsed.value.member_id).eq('status', 'approved').maybeSingle()
    if (target.error || !target.data) return json({ error: '승인된 멤버를 선택해 주세요.' }, 400)
    memberId = parsed.value.member_id
  }
  const { member_id: _ignored, ...input } = parsed.value
  void _ignored
  const result = await supabaseAdmin.from('calendar_events').insert({ ...input, member_id: memberId, created_by: auth.viewer.userId, updated_at: new Date().toISOString() }).select(SELECT).single()
  if (result.error) {
    if (isMissingTableError(result.error)) return json({ error: '캘린더 DB 적용이 필요합니다.', migration_required: true }, 503)
    if (isCheckViolation(result.error) || result.error.code === '23503' || result.error.code === '22P02') return json({ error: '입력값이 올바르지 않습니다.' }, 400)
    console.error('[calendar-events] 생성 실패', result.error.message)
    return json({ error: '일정을 등록하지 못했습니다.' }, 500)
  }
  return json({ event: rowView(result.data) }, 201)
}
