import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import {
  OG_PREVIEW_TARGETS,
  isCrawlerUserAgent,
  isMetadataImagePath,
  isOgPreviewPath,
} from '@/lib/og/targets'

/** 로그인 없이 접근 가능한 경로 (prefix 매칭) */
const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/confirm']

/** 프록시 자체를 건너뛰는 경로 (Vercel 크론은 Bearer 토큰으로 인증) */
const BYPASS_PATHS = ['/api/admin/sync-all', '/api/admin/sync-steam', '/api/cron/notify-reminders', '/api/cron/monthly-voice-award', '/api/cron/sync-tft-patch-notes', '/api/cron/sync-steam-featured-deals', '/api/cron/sync-lol-patch-notes', '/api/cron/weekly-rank-report']

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl

  if (BYPASS_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  // 링크 미리보기용 공개면. 여기서 여는 것은 (1) metadata 이미지 라우트와 (2) `/og/*`
  // 메타 전용 페이지뿐이며, 둘 다 OG 카드에 이미 인쇄되는 데이터만 담는다.
  // 이미지 원본은 카카오처럼 별도 UA 로 재요청되므로 UA 와 무관하게 열어야 한다.
  if (isMetadataImagePath(pathname) || isOgPreviewPath(pathname)) {
    return NextResponse.next()
  }

  // ⚠ UA 는 위조 가능하다. 크롤러 UA 라도 실제 앱 페이지는 절대 통과시키지 않고
  //    본문 없는 `/og/*` 로 rewrite 만 한다(URL 은 그대로라 공유 링크가 유지된다).
  const ogTarget = OG_PREVIEW_TARGETS[pathname]
  if (ogTarget && isCrawlerUserAgent(request.headers.get('user-agent'))) {
    return NextResponse.rewrite(new URL(ogTarget, request.url))
  }

  // 공식 패턴: 요청/응답 쿠키 양쪽에 써야 갱신된 세션 토큰이 유실되지 않는다.
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
            response = NextResponse.next({ request })
            cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options),
            )
          },
        },
      },
  )

  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (e) {
    console.error('[proxy] auth.getUser 실패', e instanceof Error ? e.message : '오류 발생')
  }

  // API 라우트는 각자 401/403 JSON을 반환한다. 리다이렉트하면 fetch가 HTML을 받아 파싱 에러가 난다.
  if (pathname.startsWith('/api/')) {
    return response
  }

  if (isPublicPath(pathname)) {
    if (user && pathname === '/login') {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return response
  }

  if (!user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', `${pathname}${search}`)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Next 내부 경로·정적 파일(확장자 있는 요청)·favicon/robots 등을 제외한 모든 경로.
     */
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.[^/]*$).*)',
  ],
}
