/**
 * 링크 미리보기 스크래퍼 User-Agent.
 *
 * ⚠ UA 는 위조 가능하다. 이 목록으로 여는 것은 `/og/*`(메타 전용 페이지)뿐이며,
 * 실제 앱 페이지를 UA 조건으로 통과시켜서는 절대 안 된다.
 */
export const CRAWLER_UA_PATTERN =
  /kakaotalk-scrap|kakaotalk|discordbot|facebookexternalhit|twitterbot|slackbot|slack-imgproxy|telegrambot|whatsapp|linkedinbot|redditbot|applebot|googlebot|bingbot|yeti|naver|daum/i

/** 메타데이터 이미지 라우트. 확장자가 없어 proxy matcher 에 걸리므로 명시적으로 열어준다. */
export const METADATA_IMAGE_SUFFIXES = ['/opengraph-image', '/twitter-image', '/icon', '/apple-icon']

/** 크롤러 전용 메타 페이지 prefix (본문 없음). */
export const OG_PREVIEW_PREFIX = '/og'

/** 공유 가능한 경로 → `/og` 하위 메타 전용 라우트 */
export const OG_PREVIEW_TARGETS: Record<string, string> = {
  '/': '/og/home',
  '/tft': '/og/tft',
  '/lol': '/og/lol',
}

export function isMetadataImagePath(pathname: string): boolean {
  return METADATA_IMAGE_SUFFIXES.some((s) => pathname === s || pathname.endsWith(s))
}

export function isOgPreviewPath(pathname: string): boolean {
  return pathname === OG_PREVIEW_PREFIX || pathname.startsWith(`${OG_PREVIEW_PREFIX}/`)
}

export function isCrawlerUserAgent(ua: string | null | undefined): boolean {
  return !!ua && CRAWLER_UA_PATTERN.test(ua)
}
