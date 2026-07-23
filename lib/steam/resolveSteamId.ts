// lib/steam/resolveSteamId.ts
// 사용자가 붙여넣는 4가지 형태를 SteamID64 로 정규화한다.
import 'server-only'
import { SteamApiError, resolveVanityUrl } from '@/lib/steam/api'

export const STEAM_INPUT_MAX = 200

type ParsedInput =
  | { ok: true; kind: 'id64'; value: string }
  | { ok: true; kind: 'vanity'; value: string }
  | { ok: false; message: string }

const ID64_RE = /^\d{17}$/
const PROFILES_RE = /steamcommunity\.com\/profiles\/(\d{17})/i
const VANITY_URL_RE = /steamcommunity\.com\/id\/([A-Za-z0-9_-]{2,32})/i
const BARE_VANITY_RE = /^[A-Za-z0-9_-]{2,32}$/

/**
 * 지원 형태
 *   1. 76561198000000000                          (SteamID64)
 *   2. https://steamcommunity.com/profiles/{17자리}
 *   3. https://steamcommunity.com/id/{vanity}
 *   4. {vanity}                                    (맨 문자열)
 */
export function parseSteamInput(raw: unknown): ParsedInput {
  const input = (typeof raw === 'string' ? raw : '').trim().replace(/\/+$/, '')

  if (!input) return { ok: false, message: '스팀 ID 또는 프로필 주소를 입력해주세요.' }
  if (input.length > STEAM_INPUT_MAX) {
    return { ok: false, message: `입력은 ${STEAM_INPUT_MAX}자 이하여야 합니다.` }
  }

  if (ID64_RE.test(input)) return { ok: true, kind: 'id64', value: input }

  const profiles = input.match(PROFILES_RE)
  if (profiles) return { ok: true, kind: 'id64', value: profiles[1] }

  const vanityUrl = input.match(VANITY_URL_RE)
  if (vanityUrl) return { ok: true, kind: 'vanity', value: vanityUrl[1] }

  // URL 형태인데 위 두 패턴에 안 걸리면 vanity 로 오인하지 않고 명확히 거절한다.
  if (input.includes('/') || input.includes('.')) {
    return {
      ok: false,
      message: '인식할 수 없는 주소입니다. steamcommunity.com/id/... 또는 /profiles/... 형태를 입력해주세요.',
    }
  }

  if (BARE_VANITY_RE.test(input)) return { ok: true, kind: 'vanity', value: input }

  return { ok: false, message: '스팀 ID 형식이 올바르지 않습니다.' }
}

export type SteamIdResolution =
  | { ok: true; steamId64: string }
  | { ok: false; status: number; message: string }

export async function resolveSteamId(raw: unknown): Promise<SteamIdResolution> {
  const parsed = parseSteamInput(raw)
  if (!parsed.ok) return { ok: false, status: 400, message: parsed.message }

  if (parsed.kind === 'id64') return { ok: true, steamId64: parsed.value }

  try {
    const steamId64 = await resolveVanityUrl(parsed.value)
    if (!steamId64) {
      return { ok: false, status: 400, message: '존재하지 않는 스팀 사용자 이름(vanity)입니다.' }
    }
    return { ok: true, steamId64 }
  } catch (e) {
    const status = e instanceof SteamApiError ? e.status : 500
    return {
      ok: false,
      status: status === 500 ? 500 : 502,
      message: e instanceof Error ? e.message : '스팀 조회에 실패했습니다.',
    }
  }
}
