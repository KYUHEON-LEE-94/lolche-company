import 'server-only'

/**
 * metadataBase / OG 절대 URL 의 기준 origin.
 *
 * 크롤러는 상대 URL 을 해석하지 못하므로 og:image 는 반드시 절대 URL 이어야 한다.
 * `VERCEL_URL` 은 배포마다 바뀌는 프리뷰 도메인이라 프로덕션 카드가 옛 배포를 가리킬 수 있어
 * `VERCEL_PROJECT_PRODUCTION_URL` 보다 뒤에 둔다. 운영에서는 `SITE_URL` 등록이 정답이다.
 */
export function getSiteUrl(): URL {
  const raw = process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (raw) {
    try {
      return new URL(raw.startsWith('http') ? raw : `https://${raw}`)
    } catch {
      // 잘못된 값이면 아래 폴백으로 내려간다.
    }
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`)
  }
  if (process.env.VERCEL_URL) {
    return new URL(`https://${process.env.VERCEL_URL}`)
  }
  return new URL(`http://localhost:${process.env.PORT ?? 3000}`)
}
