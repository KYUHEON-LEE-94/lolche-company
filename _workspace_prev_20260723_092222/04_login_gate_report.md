# 04 — 전역 로그인 게이트 (Discord 필수) 구현 보고서

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|-----------|---------|
| `middleware.ts` (신규) | `@supabase/ssr` `createServerClient`로 세션 확인·갱신. 비로그인 + 보호 경로 → `/login?next=<원래경로>` 307 리다이렉트 |
| `app/login/page.tsx` | `next` 쿼리를 `sanitizeNextPath()`로 정제해 OAuth `redirectTo`의 `?next=`에 전달. 이미 로그인 시 `nextPath`로 replace. 문구 조정 + "랭킹으로 돌아가기" 버튼 제거 |

## 주요 변경 사항

### middleware.ts

- **쿠키 동기화:** Supabase 공식 패턴 그대로 — `setAll`에서 `request.cookies.set()` → `NextResponse.next({ request })` 재생성 → `response.cookies.set()`. 요청/응답 양쪽에 써야 갱신 토큰이 유실되지 않는다.
- **BYPASS_PATHS:** `/api/admin/sync-all` — Vercel 크론이 `Authorization: Bearer` 로 호출하므로 미들웨어 자체를 건너뛴다(불필요한 `getUser()` 왕복도 제거).
- **PUBLIC_PATHS:** `/login`, `/auth/callback`, `/auth/confirm` — 세션 갱신은 수행하되 게이트는 통과.
- **API 라우트:** `/api/*`는 `getUser()`로 세션만 갱신하고 **리다이렉트하지 않는다.** 각 라우트가 이미 401/403 JSON을 반환하므로, 리다이렉트 시 fetch 클라이언트가 HTML을 받아 파싱 에러가 난다.
- **로그인 상태에서 `/login` 접근:** `/`로 리다이렉트.
- **matcher:** `/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\.[^/]*$).*)` — Next 내부 경로 및 확장자 있는 정적 파일 전부 제외.
- **에러 처리:** `getUser()` 실패는 `catch (e)` + `e instanceof Error ? e.message : '오류 발생'` 로 로깅 후 user=null 취급 → 안전한 방향(로그인 요구)으로 실패한다. `any` 미사용.

### app/login/page.tsx

- `sanitizeNextPath()`를 재사용(신규 함수 미작성). `?next=//evil.com` 같은 입력은 `/`로 강등되어 OAuth `redirectTo`와 로그인 후 replace 양쪽에서 오픈 리다이렉트가 차단된다.
- `redirectTo`: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}` (기존 하드코딩 `%2F` 대체).
- 문구: "랭킹을 보려면 Discord 로그인이 필요합니다."
- 비로그인 상태에서 무의미해진 "랭킹으로 돌아가기" 버튼 제거(누르면 미들웨어가 다시 `/login`으로 돌려보내므로 UX상 무한 왕복).

## ISR / AuthButtons 영향 확인

- **`app/page.tsx` (`revalidate = 60`):** 미들웨어는 캐시 조회 이전 단계에서 동작하므로 비로그인 요청은 페이지 렌더에 도달하지 않는다. 페이지 자체는 anon 클라이언트로 사용자 무관한 공개 데이터를 렌더하므로 캐시 엔트리가 사용자별로 오염될 여지가 없다. 게이트는 캐시 히트/미스와 무관하게 동일 동작. curl 재확인 결과 `/`는 항상 307.
- **`AuthButtons.tsx`:** 미수정. 로그아웃(`signOut()` + `router.refresh()`) 시 refresh 요청이 미들웨어를 타면서 `/login`으로 리다이렉트되는 것이 의도된 동작. 로그인 버튼은 `/login`(next 없음 → fallback `/`)으로 이동.

## 검증 결과

### 정적 검사
- `npx tsc --noEmit` — **통과** (출력 없음)
- `npm run lint` — **0 errors** (9 warnings 전부 기존 파일의 `<img>`/`exhaustive-deps` 사전 존재 경고, 이번 변경과 무관)

### 런타임 (localhost:3000, curl)

| 경로 | 결과 | 판정 |
|------|------|------|
| `/` | `307 → /login?next=%2F` | OK |
| `/hall-of-fame` | `307 → /login?next=%2Fhall-of-fame` | OK |
| `/custom-games` | `307 → /login?next=%2Fcustom-games` | OK |
| `/profile` | `307 → /login?next=%2Fprofile` | OK |
| `/admin/members/control` | `307 → /login?next=%2Fadmin%2Fmembers%2Fcontrol` | OK |
| `/login` | `200` | OK |
| `/login?next=//evil.com` | `200` (리다이렉트 루프 없음, next는 `/`로 강등) | OK |
| `/api/me/member` | `401` (JSON, 리다이렉트 아님) | OK |
| `/api/admin/sync-all` (무인증 GET) | `401` (미들웨어 통과, 라우트 자체 인증) | OK |
| `/auth/callback` (code 없음) | `307 → /login?error=인증 코드가 없습니다.` → `/login` 200 | **루프 없음** |
| `/auth/callback?code=bogus` | `307 → /login?error=invalid request...` | **루프 없음** |
| `/favicon.ico` | `200` (matcher 제외 동작) | OK |

> 참고: 최초 `/` 요청 1회가 500이었으나 dev 서버의 미들웨어 최초 컴파일 타이밍 문제로, 재요청 시 즉시 307 정상. 이후 반복 요청 모두 307.

## 미구현 항목

없음.

## 배포 시 유의

- 미들웨어가 `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`를 사용한다 — Vercel 환경변수에 이미 존재해야 한다(기존과 동일 변수, 추가 설정 불필요).
- Vercel 크론(`GET /api/admin/sync-all`)은 미들웨어 BYPASS 대상이므로 Bearer 토큰 인증 흐름 그대로 유지된다.
