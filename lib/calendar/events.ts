import type { CalendarEventRecurrence, CalendarEventType } from '@/types/supabase'

const ALLOWED_KEYS = new Set(['title', 'description', 'event_type', 'recurrence', 'event_date', 'event_month', 'event_day', 'is_all_day', 'event_time', 'member_id'])
const TYPES: CalendarEventType[] = ['birthday', 'anniversary', 'event']
const RECURRENCES: CalendarEventRecurrence[] = ['none', 'yearly']
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type CalendarEventInput = {
  title: string
  description: string | null
  event_type: CalendarEventType
  recurrence: CalendarEventRecurrence
  event_date: string | null
  event_month: number
  event_day: number
  is_all_day: boolean
  event_time: string | null
  member_id?: string
}

export type ParseResult = { ok: true; value: CalendarEventInput } | { ok: false; message: string }

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function parseDateOnly(value: unknown): { year: number; month: number; day: number; value: string } | null {
  if (typeof value !== 'string') return null
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3])
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day, value }
}

export function parseEventInput(body: unknown): ParseResult {
  if (!isRecord(body)) return { ok: false, message: '요청 형식이 올바르지 않습니다.' }
  if (Object.keys(body).some((key) => !ALLOWED_KEYS.has(key))) return { ok: false, message: '허용되지 않은 입력 항목이 있습니다.' }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 80) return { ok: false, message: '제목은 1~80자로 입력해 주세요.' }
  const description = body.description == null || body.description === '' ? null : typeof body.description === 'string' ? body.description.trim() : undefined
  if (description === undefined || (description?.length ?? 0) > 500) return { ok: false, message: '설명은 500자 이하로 입력해 주세요.' }
  if (typeof body.event_type !== 'string' || !TYPES.includes(body.event_type as CalendarEventType)) return { ok: false, message: '이벤트 종류가 올바르지 않습니다.' }
  if (typeof body.recurrence !== 'string' || !RECURRENCES.includes(body.recurrence as CalendarEventRecurrence)) return { ok: false, message: '반복 설정이 올바르지 않습니다.' }
  const event_type = body.event_type as CalendarEventType
  const recurrence = body.recurrence as CalendarEventRecurrence
  if (event_type !== 'event' && recurrence !== 'yearly') return { ok: false, message: '생일과 기념일은 매년 반복되어야 합니다.' }
  let event_date: string | null = null
  let event_month: number
  let event_day: number
  if (recurrence === 'none') {
    if (event_type !== 'event') return { ok: false, message: '일회성 일정은 일반 이벤트만 가능합니다.' }
    const parsed = parseDateOnly(body.event_date)
    if (!parsed) return { ok: false, message: '날짜가 올바르지 않습니다.' }
    event_date = parsed.value; event_month = parsed.month; event_day = parsed.day
  } else {
    event_month = body.event_month as number; event_day = body.event_day as number
    if (!Number.isInteger(event_month) || !Number.isInteger(event_day) || event_month < 1 || event_month > 12 || event_day < 1 || event_day > daysInMonth(2000, event_month)) return { ok: false, message: '월과 일이 올바르지 않습니다.' }
  }
  const is_all_day = body.is_all_day === undefined ? true : body.is_all_day
  if (typeof is_all_day !== 'boolean') return { ok: false, message: '하루 종일 설정이 올바르지 않습니다.' }
  let event_time: string | null = null
  if (event_type !== 'event') {
    if (!is_all_day || (body.event_time !== undefined && body.event_time !== null && body.event_time !== '')) return { ok: false, message: '생일과 기념일은 하루 종일 일정만 가능합니다.' }
  } else if (!is_all_day) {
    if (typeof body.event_time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.event_time)) return { ok: false, message: '시간은 HH:mm 형식으로 입력해 주세요.' }
    event_time = `${body.event_time}:00`
  }
  const member_id = body.member_id
  if (member_id !== undefined && (typeof member_id !== 'string' || !UUID_RE.test(member_id))) return { ok: false, message: '멤버 정보가 올바르지 않습니다.' }
  return { ok: true, value: { title, description, event_type, recurrence, event_date, event_month, event_day, is_all_day: event_type === 'event' ? is_all_day : true, event_time, ...(typeof member_id === 'string' ? { member_id } : {}) } }
}
