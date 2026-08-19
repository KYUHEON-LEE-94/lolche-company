export type DiscordActivityPeriod = {
  from: string
  to: string
}

export type ParsedDiscordActivityMember = {
  userId: string
  userName: string | null
  attendanceDays: number
  qualifiedDays: number
  voiceJoins: number
  voiceSeconds: number
  voiceMessages: number
  messages: number
}

export type ParsedDiscordActivitySummary = {
  guildId: string
  period: DiscordActivityPeriod
  timezone: string
  members: ParsedDiscordActivityMember[]
  generatedAt: string
}

const KST_OFFSET_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

function formatUtcDate(date: Date): string {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

/** KST 오늘을 포함하는 최근 일수의 양끝 날짜를 계산한다. */
export function getKstDateRange(now: Date = new Date(), days = 30): DiscordActivityPeriod {
  if (!Number.isInteger(days) || days < 1) throw new Error('days는 1 이상의 정수여야 합니다.')
  const kstNow = new Date(now.getTime() + KST_OFFSET_MS)
  const toUtc = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate())
  return {
    from: formatUtcDate(new Date(toUtc - (days - 1) * DAY_MS)),
    to: formatUtcDate(new Date(toUtc)),
  }
}

export function formatDiscordVoiceDuration(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  if (safeSeconds < 60) return '0분'

  const totalMinutes = Math.floor(safeSeconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours >= 100) return '100시간+'
  if (hours === 0) return `${minutes}분`
  if (minutes === 0) return `${hours}시간`
  return `${hours}시간 ${minutes}분`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0
}

function parseMember(value: unknown): ParsedDiscordActivityMember | null {
  if (!isRecord(value)) return null
  if (
    !isNonEmptyString(value.user_id) ||
    (value.user_name !== undefined && value.user_name !== null && typeof value.user_name !== 'string') ||
    !isNonNegativeInteger(value.attendance_days) ||
    !isNonNegativeInteger(value.qualified_days) ||
    !isNonNegativeInteger(value.voice_joins) ||
    !isNonNegativeInteger(value.voice_seconds) ||
    !isNonNegativeInteger(value.voice_messages) ||
    !isNonNegativeInteger(value.messages)
  ) return null

  return {
    userId: value.user_id,
    userName: typeof value.user_name === 'string' ? value.user_name : null,
    attendanceDays: value.attendance_days,
    qualifiedDays: value.qualified_days,
    voiceJoins: value.voice_joins,
    voiceSeconds: value.voice_seconds,
    voiceMessages: value.voice_messages,
    messages: value.messages,
  }
}

/** 외부 API 응답을 신뢰 경계에서 검증한다. 일부 행만 잘못돼도 전체 응답을 거부한다. */
export function parseDiscordActivitySummary(value: unknown): ParsedDiscordActivitySummary | null {
  if (!isRecord(value) || !isRecord(value.period) || !Array.isArray(value.members)) return null
  if (
    !isNonEmptyString(value.guild_id) ||
    !isNonEmptyString(value.period.from) ||
    !isNonEmptyString(value.period.to) ||
    !isNonEmptyString(value.timezone) ||
    !isNonEmptyString(value.generated_at)
  ) return null

  const members: ParsedDiscordActivityMember[] = []
  for (const member of value.members) {
    const parsed = parseMember(member)
    if (!parsed) return null
    members.push(parsed)
  }

  return {
    guildId: value.guild_id,
    period: { from: value.period.from, to: value.period.to },
    timezone: value.timezone,
    members,
    generatedAt: value.generated_at,
  }
}
