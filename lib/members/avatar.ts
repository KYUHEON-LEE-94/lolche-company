/**
 * 멤버 아바타 URL 해석 — **단일 진입점**.
 *
 * 우선순위: `discord_avatar_url` → null
 *
 * ★ 프로필 사진은 Discord 전용이다
 *   직접 업로드 기능은 제거됐다. 표시 아바타는 Discord OAuth 로그인 때 자동으로 채워지는
 *   `discord_avatar_url` 하나뿐이며, 없으면 null(호출부에서 이니셜/기본 이미지)로 내려간다.
 *   `profile_image_path`(옛 업로드 경로)는 컬럼을 DROP 하지 않고 남겨 두되 표시에는 읽지 않는다.
 *   `hall_of_fame` 스냅샷(`profile_image_snapshot`)만 예외로 `profileImageUrl()` 로 렌더한다
 *   — 추방된 멤버는 Discord 연결이 없을 수 있어 과거 스냅샷이 유일한 이미지원이다.
 *
 * ⚠ 클라이언트 컴포넌트도 import 한다. server-only 모듈을 여기서 import 하지 말 것.
 */
import { isMissingColumnError, type PgErrorLike } from '@/lib/db/pgErrors'

export type AvatarSource = {
  /** 마이그레이션 미적용 환경에서는 컬럼 자체가 없어 undefined 로 들어온다. */
  discord_avatar_url?: string | null
}

/** members 조회에 덧붙일 아바타 컬럼. `withAvatarColumn` 과 함께 쓴다. */
export const AVATAR_COLUMN = 'discord_avatar_url'

/**
 * Supabase Storage `profile-images` 공개 URL 조립.
 * 지금은 `hall_of_fame`의 `profile_image_snapshot`(추방 멤버 폴백) 렌더에만 쓰인다.
 */
export function profileImageUrl(path: string | null | undefined): string | null {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${path}`
}

/**
 * Discord CDN 아바타 URL 인지 검증한다.
 *
 * user_metadata 는 IdP가 채우는 값이라 신뢰 경계 밖이다. 검증 없이 next/image 에 넘기면
 * 임의 외부 URL 이 렌더된다. 저장 시점과 표시 시점 양쪽에서 확인한다.
 */
export function isDiscordAvatarUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'cdn.discordapp.com'
  } catch {
    return false
  }
}

/** 아바타 표시 URL. 없으면 null (호출부에서 이니셜/기본 이미지로 대체) */
export function resolveAvatarUrl(member: AvatarSource | null | undefined): string | null {
  if (!member) return null
  if (isDiscordAvatarUrl(member.discord_avatar_url)) return member.discord_avatar_url
  return null
}

export type AvatarQueryResult = {
  data: unknown
  error: (PgErrorLike & { message?: string }) | null
}

/**
 * `discord_avatar_url` 컬럼을 붙여 조회하되, 마이그레이션 미적용(42703)이면
 * 컬럼 없이 한 번 더 조회해 degrade 한다. 500 대신 아바타 없이(이니셜/기본 이미지) 보이게 된다.
 *
 * 사용: withAvatarColumn((cols) => supabase.from('members').select('id,member_name' + cols))
 */
export async function withAvatarColumn(
  run: (avatarColumns: string) => PromiseLike<AvatarQueryResult>,
): Promise<AvatarQueryResult> {
  const first = await run(`,${AVATAR_COLUMN}`)
  if (first.error && isMissingColumnError(first.error)) return run('')
  return first
}
