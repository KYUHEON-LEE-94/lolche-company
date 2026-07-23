# 구현 결과 — 이메일/패스워드 제거 + Discord OAuth 전환

## 변경 파일 목록

| 파일 경로 | 유형 | 변경 내용 |
|---|---|---|
| `lib/auth/discord.ts` | 신규 | `getDiscordId`, `getDiscordDisplayName`, `sanitizeNextPath` 공통 유틸 |
| `app/auth/callback/route.ts` | 신규 | `exchangeCodeForSession` + `members`/`admins` discord_id ↔ user_id 연결 |
| `scripts/sql/20260722_discord_auth.sql` | 신규 | 마이그레이션 SQL (사용자가 직접 실행) |
| `app/login/page.tsx` | 전면 교체 | 이메일/비밀번호 폼·`signInWithPassword` 제거 → Discord 버튼 |
| `app/admin/login/page.tsx` | 전면 교체 | 인라인 `createBrowserClient` 제거, `supabaseClient` 사용, Discord 버튼 |
| `app/components/AuthButtons.tsx` | 수정 | 로그인 판별 email → user 기반 (버그 수정), Discord 닉네임 표시, admin 조회 fallback |
| `app/lib/isAdmin.ts` | 수정 | user_id 미스 시 discord_id 매칭 + user_id 자체 치유 백필 |
| `app/api/admin/me/route.ts` | 수정 | `requireAdmin()` 경유(discord fallback 포함), 401/403 구분 유지 |
| `lib/supabase/route.ts` | 수정 | `getCurrentAdmin()` discord_id fallback, `select('*')` → 명시 컬럼 |
| `types/supabase.ts` | 수정 | `Member.user_id`/`Member.discord_id`, `Admin.id`/`Admin.discord_id` 추가, `user_id` nullable |
| `CLAUDE.md` | 수정 | 인증 설명, 디렉토리 구조, DB 테이블 표 갱신 |

## 주요 변경 사항

### 1. Discord OAuth 진입점
- `/login`, `/admin/login` 모두 `signInWithOAuth({ provider: 'discord' })`.
- `redirectTo`는 `${origin}/auth/callback?next=<경로>`. 관리자 로그인은 `next=/admin/members/sync`.
- `/login`은 `?error=` query를 읽어 콜백 실패 메시지를 표시 (effect setState 없이 파생값으로 처리).
- `useSearchParams` 사용으로 `Suspense` 경계 추가.

### 2. 콜백 라우트 (`app/auth/callback/route.ts`)
- `export const dynamic = 'force-dynamic'`.
- `code` 없음/OAuth 에러 → `/login?error=...` 리다이렉트.
- 세션 생성 후 Discord snowflake로 `members`, `admins` 행을 찾아 `user_id` 연결.
- 연결 실패는 `console.error`만 남기고 로그인은 성공 처리 (미등록 사용자 허용).

### 3. 위험 요소 대응 (필수 항목)
- **위험 3 — AuthButtons email 판별 버그:** `userEmail` state를 제거하고 `isLoggedIn`(user 존재 여부)로 판별. Discord가 email을 주지 않아도 로그인 상태가 올바르게 인식됨. 표시명은 `full_name → name → user_name → preferred_username` 순.
- **위험 4 — 오픈 리다이렉트:** `sanitizeNextPath()`가 `/`로 시작하고 `//`·`/\`가 아닌 경로만 허용, 그 외 `/`로 폴백. `?next=https://evil.com`, `?next=//evil.com` 모두 차단.
- **위험 5 — user_id 덮어쓰기:** 조회 후 `row.user_id`가 다른 값이면 갱신하지 않고 로그만 남김. 갱신 쿼리 자체에도 `.is('user_id', null)` 가드를 걸어 경합 상황에서도 덮어쓰기 불가.

### 4. 방어적 구현 (admins 스키마 미확인 대응)
- 코드는 `admins.user_id`가 nullable이든 아니든 동작한다. `id` 컬럼은 어디서도 select/insert하지 않으므로 (A)안 미적용 스키마에서도 런타임 영향 없음.
- 관리자 판정은 항상 `user_id` 우선 → `discord_id` fallback 2단계.

### 5. 타입 이슈 메모
`supabaseService`(제네릭 `<Database>`)에서 행 타입이 `never`로 추론되는 기존 문제가 있어, 필드를 역참조하는 쿼리에는 기존 코드(`lib/actions/season-actions.ts`)와 동일하게 `.schema('public')`을 체이닝했다. `any` 캐스팅은 사용하지 않았다.

## 검증 결과
- `npx tsc --noEmit` → **에러 0개**
- `npm run lint` → **에러 0개** (warning 10건은 모두 기존 파일의 사전 존재 항목: `<img>`, exhaustive-deps 등)
- `grep -rn signInWithPassword app lib` → **0건**
- 이메일/비밀번호 input 요소 → **0건**

## 마이그레이션 SQL 경로
`scripts/sql/20260722_discord_auth.sql`

> ⚠ DB에 직접 접속해 실행하지 않았다. 사용자가 Supabase SQL Editor에서 직접 실행해야 한다.

파일 구성:
- STEP 0: `admins` 구조·제약·FK 확인 쿼리 (주석) — **먼저 실행해 결과를 확인할 것**
- STEP 1: `members.user_id`, `members.discord_id`, `admins.discord_id` 컬럼 + 부분 유니크 인덱스
- STEP 2: **(A)안 기본 적용** — `admins.id` 대리 PK 도입 + `user_id` nullable 전환 (+ user_id 부분 유니크 인덱스)
- STEP 3: 기존 관리자/멤버 discord_id 주입 (주석 템플릿)
- STEP 4: 연결 상태 검증 쿼리

## 사용자가 직접 해야 할 설정 절차

### A. Discord Developer Portal
1. https://discord.com/developers/applications → New Application (또는 기존 앱 선택)
2. **OAuth2 → Redirects**에 추가: `https://<PROJECT_REF>.supabase.co/auth/v1/callback`
3. **OAuth2 → Client ID / Client Secret** 복사 (Secret은 Reset 시 1회만 노출)

### B. Supabase 대시보드
1. **Authentication → Providers → Discord** → Enable → Client ID/Secret 입력 → Scope 기본(`identify email`) 유지 → Save
2. **Authentication → URL Configuration**
   - Site URL: 운영 도메인
   - Redirect URLs에 추가: `http://localhost:3000/auth/callback`, `https://<운영도메인>/auth/callback`
3. **SQL Editor**에서 `scripts/sql/20260722_discord_auth.sql`을 STEP 0 → 1 → 2 → 3 순서로 실행
4. **Authentication → Providers → Email** 비활성화 — ⚠ **STEP 3(discord_id 주입) 완료 및 관리자 로그인 성공 확인 후에 끌 것.** 먼저 끄면 롤백 경로가 사라진다.

### C. Discord 사용자 ID 수집 방법
Discord 앱 → 설정 → 고급 → **개발자 모드 ON** → 대상 유저 우클릭 → "사용자 ID 복사" (17~19자리 숫자)

### D. 전환 순서 권장
1. B-1, B-2 (provider/URL 설정)
2. B-3 (SQL STEP 0~2)
3. Discord ID 수집 → SQL STEP 3으로 **최소 1명의 슈퍼 관리자** discord_id 주입
4. 배포 → `/admin/login`에서 Discord 로그인 → `/api/admin/me` 200 확인
5. 나머지 멤버 discord_id 주입
6. 마지막에 B-4 (Email provider 비활성화)

## 미구현 항목
| 항목 | 사유 |
|---|---|
| `middleware.ts` 세션 자동 갱신 | 계획 6번 위험 요소에서 "후속 과제 권장"으로 분류. 범위 외 |
| Supabase 클라이언트 3중 중복 정리 | 계획 7번 위험 요소, 범위 외 리팩토링 |
| `createRouteClient` `<Database>` 제네릭 적용 | 계획 8번에서 "별도 커밋 권장" 명시 |
| `admins` 실제 스키마 확인 | DB 직접 접속 금지 지시에 따름. SQL STEP 0 확인 쿼리로 대체 |
