export const GAME_KINDS = ['tft', 'lol', 'steam', 'etc'] as const
export type GameKind = (typeof GAME_KINDS)[number]

export const GAME_STATUSES = ['recruiting', 'in_progress', 'ended', 'cancelled'] as const
export type GameStatus = (typeof GAME_STATUSES)[number]

/** 참가 신청/취소가 가능한 상태 */
export const JOINABLE_STATUSES: readonly GameStatus[] = ['recruiting']
/** 주최자당 동시 보유 제한에 포함되는 상태 */
export const ACTIVE_STATUSES: readonly GameStatus[] = ['recruiting', 'in_progress']
/** 라운드·팀·게스트 등 진행 조작이 가능한 상태 */
export const OPERABLE_STATUSES: readonly GameStatus[] = ['recruiting', 'in_progress']

export const TITLE_MAX = 60
export const GAME_KIND_LABEL_MAX = 30
export const CAPACITY_MIN = 2
export const CAPACITY_MAX = 100
/** tft + team(2인 팀전)은 4팀 × 2명 구조라 정원이 8로 고정된다 */
export const TFT_TEAM_CAPACITY = 8
export const MAX_ROUNDS_MIN = 1
export const MAX_ROUNDS_MAX = 20
export const MAX_ACTIVE_GAMES_PER_HOST = 3

/** 등록 직후 시작하는 내전을 허용하기 위한 과거 방향 유예 */
export const SCHEDULE_PAST_GRACE_MS = 10 * 60 * 1000
export const SCHEDULE_MAX_AHEAD_MS = 90 * 24 * 60 * 60 * 1000

/** 한국은 서머타임이 없으므로 고정 오프셋으로 안전하게 변환할 수 있다 */
export const KST_OFFSET = '+09:00'

export function isGameKind(value: unknown): value is GameKind {
  return typeof value === 'string' && (GAME_KINDS as readonly string[]).includes(value)
}

export function isGameStatus(value: unknown): value is GameStatus {
  return typeof value === 'string' && (GAME_STATUSES as readonly string[]).includes(value)
}

/** 대기자 무한 증식 방지용 총 신청 상한. 정확도 요구가 낮아 앱 count로 충분하다. */
export function signupLimit(capacity: number): number {
  return Math.min(capacity * 3, 60)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string }

/**
 * 클라이언트는 "YYYY-MM-DD" + "HH:mm" 문자열만 보낸다.
 * 브라우저에서 ISO로 변환하면 사용자의 로컬 타임존으로 해석되어 실제 일정과 어긋나므로,
 * KST 오프셋을 붙이는 변환은 반드시 서버에서만 한다.
 */
export function parseScheduledAt(dateRaw: unknown, timeRaw: unknown): ParseResult<string> {
  const date = typeof dateRaw === 'string' ? dateRaw.trim() : ''
  const time = typeof timeRaw === 'string' ? timeRaw.trim() : ''

  if (!date || !time) {
    return { ok: false, message: '일자와 시간을 모두 입력하세요' }
  }
  if (!DATE_RE.test(date)) {
    return { ok: false, message: '일자는 YYYY-MM-DD 형식이어야 합니다' }
  }
  if (!TIME_RE.test(time)) {
    return { ok: false, message: '시간은 HH:mm 형식이어야 합니다' }
  }

  const parsed = new Date(`${date}T${time}:00${KST_OFFSET}`)
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, message: '올바르지 않은 일정입니다' }
  }

  const now = Date.now()
  if (parsed.getTime() < now - SCHEDULE_PAST_GRACE_MS) {
    return { ok: false, message: '지난 일정으로는 내전을 만들 수 없습니다' }
  }
  if (parsed.getTime() > now + SCHEDULE_MAX_AHEAD_MS) {
    return { ok: false, message: '일정은 90일 이내여야 합니다' }
  }

  return { ok: true, value: parsed.toISOString() }
}

export type GameKindInput = {
  game_kind: GameKind
  game_kind_label: string | null
  steam_app_id: number | null
}

/** appid는 표시(캡슐 이미지)용 스냅샷이라 FK가 없다. 형식만 검증한다. */
const STEAM_APP_ID_MAX = 2147483647

export function parseGameKind(
  kindRaw: unknown,
  labelRaw: unknown,
  steamAppIdRaw?: unknown,
): ParseResult<GameKindInput> {
  if (!isGameKind(kindRaw)) {
    return { ok: false, message: `게임 종류는 ${GAME_KINDS.join(', ')} 중 하나여야 합니다` }
  }

  const label = typeof labelRaw === 'string' ? labelRaw.trim() : ''

  if (kindRaw === 'etc') {
    if (!label) return { ok: false, message: '기타 게임은 종류 이름을 입력해야 합니다' }
    if (label.length > GAME_KIND_LABEL_MAX) {
      return { ok: false, message: `게임 종류 이름은 ${GAME_KIND_LABEL_MAX}자 이하여야 합니다` }
    }
    return { ok: true, value: { game_kind: kindRaw, game_kind_label: label, steam_app_id: null } }
  }

  if (kindRaw === 'steam') {
    // 스팀은 "게임 미정" 모집을 허용하므로 라벨이 선택적이다.
    if (label.length > GAME_KIND_LABEL_MAX) {
      return { ok: false, message: `게임 이름은 ${GAME_KIND_LABEL_MAX}자 이하여야 합니다` }
    }
    const appId = parseSteamAppId(steamAppIdRaw)
    if (!appId.ok) return { ok: false, message: appId.message }
    // 이름 없이 appid만 남으면 표시할 것이 없다.
    return {
      ok: true,
      value: {
        game_kind: kindRaw,
        game_kind_label: label || null,
        steam_app_id: label ? appId.value : null,
      },
    }
  }

  // CHECK 제약이 game_kind not in ('etc','steam') 일 때 라벨/appid null을 강제한다.
  return { ok: true, value: { game_kind: kindRaw, game_kind_label: null, steam_app_id: null } }
}

function parseSteamAppId(raw: unknown): ParseResult<number | null> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: null }
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value <= 0 || value > STEAM_APP_ID_MAX) {
    return { ok: false, message: '스팀 앱 ID가 올바르지 않습니다' }
  }
  return { ok: true, value }
}

export function parseTitle(raw: unknown): ParseResult<string> {
  const title = typeof raw === 'string' ? raw.trim() : ''
  if (!title) return { ok: false, message: '제목을 입력하세요' }
  if (title.length > TITLE_MAX) {
    return { ok: false, message: `제목은 ${TITLE_MAX}자 이하여야 합니다` }
  }
  return { ok: true, value: title }
}

export function parseCapacity(
  raw: unknown,
  gameKind: GameKind,
  gameType: string,
): ParseResult<number> {
  if (gameKind === 'tft' && gameType === 'team') {
    // 팀 배정 로직이 4팀 × 2명을 전제하므로 정원을 협상하지 않는다.
    return { ok: true, value: TFT_TEAM_CAPACITY }
  }

  const capacity = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(capacity)) {
    return { ok: false, message: '정원은 정수여야 합니다' }
  }
  if (capacity < CAPACITY_MIN || capacity > CAPACITY_MAX) {
    return { ok: false, message: `정원은 ${CAPACITY_MIN}~${CAPACITY_MAX}명이어야 합니다` }
  }
  return { ok: true, value: capacity }
}

export function parseMaxRounds(raw: unknown): ParseResult<number> {
  const value = raw === undefined || raw === null ? 5 : typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(value) || value < MAX_ROUNDS_MIN || value > MAX_ROUNDS_MAX) {
    return { ok: false, message: `판 수는 ${MAX_ROUNDS_MIN}~${MAX_ROUNDS_MAX} 사이여야 합니다` }
  }
  return { ok: true, value }
}

export function parseGameType(raw: unknown): ParseResult<'solo' | 'team'> {
  const value = raw === undefined || raw === null ? 'solo' : raw
  if (value !== 'solo' && value !== 'team') {
    return { ok: false, message: '게임 방식은 solo 또는 team이어야 합니다' }
  }
  return { ok: true, value }
}
