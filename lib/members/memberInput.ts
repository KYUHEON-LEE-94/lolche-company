export const MEMBER_NAME_MAX = 50
export const RIOT_GAME_NAME_MAX = 30
export const RIOT_TAGLINE_MAX = 10
export const REJECTED_REASON_MAX = 200

/** 멤버당 등록 가능한 라이엇 계정 수. DB의 account_no CHECK(1~3)와 반드시 같아야 한다. */
export const MAX_RIOT_ACCOUNTS = 3

export type RiotIdInput = {
  riot_game_name: string
  riot_tagline: string
}

export type MemberInput = RiotIdInput & {
  member_name: string
}

type ParseResult =
  | { ok: true; value: MemberInput }
  | { ok: false; message: string }

type RiotIdParseResult =
  | { ok: true; value: RiotIdInput }
  | { ok: false; message: string }

/**
 * 태그라인은 영문/숫자로 제한하지 않는다.
 * Riot 은 한글 태그라인을 허용하고 실제로 사용 중인 멤버가 있다(예: `딸 깍#쉽다쉬워`).
 * `^[A-Za-z0-9]{2,10}$` 로 막으면 정상 계정이 등록 불가가 되고,
 * riot_accounts 의 DB CHECK 와도 어긋나 백필이 23514 로 실패한다.
 * 따라서 공백과 구분자 `#` 만 거르고 나머지는 길이로만 제한한다.
 */
const TAGLINE_FORBIDDEN = /[\s#]/

function taglineError(riot_tagline: string): string | null {
  if (riot_tagline.length > RIOT_TAGLINE_MAX) {
    return `태그라인은 ${RIOT_TAGLINE_MAX}자 이하여야 합니다.`
  }
  if (TAGLINE_FORBIDDEN.test(riot_tagline)) {
    return '태그라인에는 공백과 #을 넣을 수 없습니다.'
  }
  return null
}

/**
 * 라이엇 ID(게임명+태그라인)만 받는 파서. riot_accounts 라우트 전용.
 * member_name 은 사람 축(members)이라 계정 추가/수정으로는 바뀌지 않는다.
 */
export function parseRiotAccountInput(body: unknown): RiotIdParseResult {
  const source = (body ?? {}) as Record<string, unknown>
  const asString = (v: unknown) => (typeof v === 'string' ? v : '')

  const riot_game_name = asString(source.riot_game_name).trim()
  const riot_tagline = asString(source.riot_tagline).trim().replace(/^#/, '')

  if (!riot_game_name || !riot_tagline) {
    return { ok: false, message: '라이엇 게임명과 태그라인을 모두 입력해주세요.' }
  }
  if (riot_game_name.length > RIOT_GAME_NAME_MAX) {
    return { ok: false, message: `라이엇 게임명은 ${RIOT_GAME_NAME_MAX}자 이하여야 합니다.` }
  }
  const taglineMessage = taglineError(riot_tagline)
  if (taglineMessage) {
    return { ok: false, message: taglineMessage }
  }

  return { ok: true, value: { riot_game_name, riot_tagline } }
}

/**
 * 자가 등록/관리자 등록 공용 입력 파서.
 * 화이트리스트 3개 컬럼만 뽑아내므로 status·approved_by 등 권한 컬럼이
 * 페이로드에 섞여 들어와도 이 함수를 통과한 값에는 절대 포함되지 않는다.
 */
export function parseMemberInput(body: unknown): ParseResult {
  const source = (body ?? {}) as Record<string, unknown>

  // 문자열이 아닌 값(객체·배열·숫자)이 String()으로 조용히 강제 변환되어
  // "[object Object]" 같은 값이 통과하지 않도록 타입 자체를 거른다.
  const asString = (v: unknown) => (typeof v === 'string' ? v : '')

  const member_name = asString(source.member_name).trim()
  const riot_game_name = asString(source.riot_game_name).trim()
  const riot_tagline = asString(source.riot_tagline).trim().replace(/^#/, '')

  if (!member_name || !riot_game_name || !riot_tagline) {
    return { ok: false, message: '단톡방 아이디, 라이엇 게임명, 태그라인을 모두 입력해주세요.' }
  }
  if (member_name.length > MEMBER_NAME_MAX) {
    return { ok: false, message: `단톡방 아이디는 ${MEMBER_NAME_MAX}자 이하여야 합니다.` }
  }
  if (riot_game_name.length > RIOT_GAME_NAME_MAX) {
    return { ok: false, message: `라이엇 게임명은 ${RIOT_GAME_NAME_MAX}자 이하여야 합니다.` }
  }
  const taglineMessage = taglineError(riot_tagline)
  if (taglineMessage) {
    return { ok: false, message: taglineMessage }
  }

  return { ok: true, value: { member_name, riot_game_name, riot_tagline } }
}

export function isSameRiotId(a: RiotIdInput, b: RiotIdInput) {
  return (
    a.riot_game_name.toLowerCase() === b.riot_game_name.toLowerCase() &&
    a.riot_tagline.toLowerCase() === b.riot_tagline.toLowerCase()
  )
}
