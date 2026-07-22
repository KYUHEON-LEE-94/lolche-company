import type { User } from '@supabase/supabase-js'

/**
 * Discord provider의 고유 숫자 ID(snowflake)를 추출한다.
 * identities가 비어있는 세션(토큰만 복원된 경우)을 대비해 user_metadata를 fallback으로 사용한다.
 */
export function getDiscordId(user: User | null | undefined): string | null {
  if (!user) return null

  const identityId = user.identities?.find((i) => i.provider === 'discord')?.id
  if (typeof identityId === 'string' && identityId.length > 0) return identityId

  const providerId = user.user_metadata?.provider_id
  if (typeof providerId === 'string' && providerId.length > 0) return providerId

  const sub = user.user_metadata?.sub
  if (typeof sub === 'string' && sub.length > 0) return sub

  return null
}

/** Discord 계정의 표시 이름 (없으면 null) */
export function getDiscordDisplayName(user: User | null | undefined): string | null {
  if (!user) return null
  const meta = user.user_metadata
  const candidates = [meta?.full_name, meta?.name, meta?.user_name, meta?.preferred_username]
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c
  }
  return null
}

/**
 * 오픈 리다이렉트 방지: 같은 오리진의 절대 경로만 허용한다.
 * `//evil.com`, `https://evil.com`, `/\evil.com` 형태를 모두 거부.
 *
 * WHATWG URL 파서는 탭(\t)·개행(\n)·CR(\r)을 URL에서 **제거**하므로
 * `/%09/evil.com` → `/\t/evil.com` → 파싱 시 `//evil.com`(프로토콜 상대 URL)이 되어
 * 외부로 리다이렉트된다. 따라서 검사 전에 제어문자를 먼저 제거해야 한다.
 */
export function sanitizeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next) return fallback

  const cleaned = next.replace(/[\u0000-\u001F\u007F]/g, '')
  if (!cleaned.startsWith('/')) return fallback
  if (cleaned.startsWith('//') || cleaned.startsWith('/\\')) return fallback
  return cleaned
}
