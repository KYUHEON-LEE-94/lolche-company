/**
 * 멤버 아바타 URL 해석 — **단일 진입점**.
 *
 * 우선순위: `profile_image_path`(직접 업로드) → `discord_avatar_url` → null
 *
 * ★ 왜 업로드가 Discord보다 먼저인가
 *   Discord 아바타는 로그인할 때 자동으로 채워지므로 "설정한 적 없는데 바뀌는 값"이다.
 *   업로드는 사용자가 명시적으로 한 행동이고 제거 버튼도 있다.
 *   Discord를 위로 두면 업로드해도 화면이 안 바뀌는 죽은 UI가 되고,
 *   그걸 피하려면 "어느 쪽을 쓸지" 토글을 새로 만들어야 한다.
 *   업로드 우선이면 토글 없이도 두 값이 자연스럽게 공존한다
 *   (업로드 제거 = Discord 아바타로 복귀).
 *
 * 나중에 업로드 기능을 걷어낼 때는 이 파일의 한 줄만 지우면 된다.
 *
 * ⚠ 클라이언트 컴포넌트도 import 한다. server-only 모듈을 여기서 import 하지 말 것.
 */
import { isMissingColumnError, type PgErrorLike } from '@/lib/db/pgErrors'

export type AvatarSource = {
  profile_image_path?: string | null
  /** 마이그레이션 미적용 환경에서는 컬럼 자체가 없어 undefined 로 들어온다. */
  discord_avatar_url?: string | null
}

/** members 조회에 덧붙일 아바타 컬럼. `withAvatarColumn` 과 함께 쓴다. */
export const AVATAR_COLUMN = 'discord_avatar_url'

/** Supabase Storage `profile-images` 공개 URL 조립 (기존 각 화면에 흩어져 있던 로직) */
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
  const uploaded = profileImageUrl(member.profile_image_path)
  if (uploaded) return uploaded
  if (isDiscordAvatarUrl(member.discord_avatar_url)) return member.discord_avatar_url
  return null
}

export type AvatarQueryResult = {
  data: unknown
  error: (PgErrorLike & { message?: string }) | null
}

/**
 * `discord_avatar_url` 컬럼을 붙여 조회하되, 마이그레이션 미적용(42703)이면
 * 컬럼 없이 한 번 더 조회해 degrade 한다. 500 대신 폴백(업로드 이미지)만 보이게 된다.
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
