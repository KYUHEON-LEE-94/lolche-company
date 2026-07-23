# 분석 결과 — 이메일 로그인 제거 + Discord OAuth 전환

## 작업 요약
이메일/패스워드 인증을 완전히 제거하고 Supabase Auth Discord OAuth(PKCE + `/auth/callback` 코드 교환)로 교체하며, `members`/`admins`를 Discord provider id로 자동 매칭해 `user_id`를 연결한다.

## 확인된 현재 구조 (사실)

- 인증 진입점 2곳
  - `app/login/page.tsx` — `supabaseClient.auth.signInWithPassword` (L28), 세션 있으면 `/`로 replace (L16-21)
  - `app/admin/login/page.tsx` — 파일 내부에서 `createBrowserClient`를 **직접 생성**(L6-9, 공용 클라이언트 미사용), 로그인 성공 시 `window.location.href = '/admin/members/sync'` (L33)
- 세션/로그아웃: `app/components/AuthButtons.tsx` — `getSession`(L19), `onAuthStateChange`(L44), `signOut`(L70), anon 클라이언트로 `admins`를 `user_id`로 직접 조회(L27-31, L53-57)
- 권한: `app/lib/isAdmin.ts` — `createRouteClient().auth.getUser()` → `supabaseService.from('admins').eq('user_id', user.id)`
- 클라이언트 팩토리
  - `lib/supabase.ts` — `supabase`(anon), `supabaseClient`(browser). 둘 다 `<Database>` 제네릭 미적용
  - `lib/supabase/browser.ts` — 타입 적용된 별도 브라우저 클라이언트 (중복 존재)
  - `lib/supabase/route.ts` — `createRouteClient()` (cookies getAll/setAll 구현 완료 → `exchangeCodeForSession`에 그대로 사용 가능). `createServerClient`에 `<Database>` 미적용
  - `lib/supabase/service.ts` — service role
- `auth.getUser()` 사용처(로그인 방식 변경과 무관하게 그대로 동작): `app/api/admin/me/route.ts`, `app/api/profile/frame/route.ts`, `app/api/profile/image/route.ts`, `app/profile/page.tsx`, `app/profile/ProfileEditor.tsx`(L40, L110, L128), `app/admin/profile-frames/page.tsx`(L11), `lib/supabase/route.ts`
- **middleware.ts 없음** → 세션 자동 갱신 미들웨어 부재
- `app/auth/` 디렉토리 없음 → 콜백 라우트 신규 생성 필요
- 타입 `types/supabase.ts`
  - `Member`에 **`user_id` 필드 없음**(L8-50). 그럼에도 `app/profile/page.tsx` L66에서 `.eq('user_id', user.id)` 사용 — `createRouteClient`가 타입 미적용이라 컴파일 통과 중. 실제 DB에는 컬럼 존재로 판단 ("확인 필요")
  - `Admin`: `user_id`(PK 추정), `display_name`, `is_super_admin`, `created_at`

## 영향 파일 목록

| 파일 경로 | 변경 유형 | 이유 |
|---|---|---|
| `app/login/page.tsx` | 전면 교체 | 이메일/패스워드 폼·`signInWithPassword` 제거 → Discord 버튼 |
| `app/admin/login/page.tsx` | 전면 교체 | 동일. 인라인 `createBrowserClient` 제거하고 `@/lib/supabase`의 `supabaseClient` 사용 |
| `app/auth/callback/route.ts` | 신규 | `exchangeCodeForSession` + discord_id 매칭/연결 |
| `app/lib/isAdmin.ts` | 수정 | `user_id` 조회 실패 시 discord identity id 기반 매칭 + user_id 백필 |
| `lib/supabase/route.ts` | 수정(선택) | `getCurrentAdmin`도 discord 매칭 대응 |
| `types/supabase.ts` | 수정 | `Member.user_id`(누락), `Member.discord_id`, `Admin.discord_id` 추가 |
| `app/components/AuthButtons.tsx` | 수정 | 로그아웃/세션 로직 유지. 로그인 판별을 email → user 기반으로, 표시명은 Discord 닉네임 |
| `app/api/admin/me/route.ts` | 검토 | user_id 연결 후 그대로 동작 |
| `app/profile/page.tsx` | 검토 | `members.user_id` 연결이 콜백에서 끝난 뒤 정상 동작 |
| `CLAUDE.md` | 수정 | "인증: Supabase Auth (이메일/패스워드)" → Discord OAuth |
| `scripts/sql/*_discord_auth.sql` | 신규 | 마이그레이션 SQL 보관 |

## 구현 계획

### 0단계 — 사용자가 직접 해야 할 사전 작업 (코드로 대체 불가)
1. **Discord Developer Portal** → Applications → 앱 생성/선택 → OAuth2 → Redirects에 추가:
   - `https://<PROJECT_REF>.supabase.co/auth/v1/callback` (필수)
   - Client ID / Client Secret 복사
2. **Supabase 대시보드** → Authentication → Providers → Discord → Enable, Client ID/Secret 입력, Scope 기본(`identify email`) 유지 후 Save
3. **Supabase 대시보드** → Authentication → URL Configuration
   - Site URL: 운영 도메인
   - Redirect URLs에 `http://localhost:3000/auth/callback`, `https://<운영도메인>/auth/callback` 추가
4. (선택) Email provider 비활성화 — 이메일/패스워드 경로 완전 차단
5. 기존 관리자/멤버의 **Discord 숫자 ID(snowflake)** 수집 → 1단계 SQL의 UPDATE로 주입

### 1단계 — DB 마이그레이션 SQL
```sql
alter table public.members add column if not exists discord_id text;
create unique index if not exists members_discord_id_key
  on public.members (discord_id) where discord_id is not null;
create unique index if not exists members_user_id_key
  on public.members (user_id) where user_id is not null;

alter table public.admins add column if not exists discord_id text;
create unique index if not exists admins_discord_id_key
  on public.admins (discord_id) where discord_id is not null;
```

**핵심 위험 — `admins.user_id`가 PK/NOT NULL이면 사전 등록 불가.**
Discord 첫 로그인 *전에* discord_id로 관리자를 등록하려면 `user_id`가 NULL 가능해야 한다. 구조 확인 후 택일:

```sql
-- (A) 권장: 대리 PK 도입 + user_id nullable
alter table public.admins add column if not exists id uuid default gen_random_uuid();
alter table public.admins drop constraint if exists admins_pkey;
alter table public.admins add primary key (id);
alter table public.admins alter column user_id drop not null;
```
> `admins.user_id`를 참조하는 FK가 있으면 위 변경 전 확인·조정 필요. **확인 필요.**

```sql
-- (B) 구조 변경 불가 시: 별도 대기 테이블
create table if not exists public.admin_discord_allowlist (
  discord_id text primary key,
  display_name text,
  created_at timestamptz default now()
);
```
(B)면 콜백에서 allowlist 히트 시 `admins` 행을 INSERT.

```sql
-- 기존 데이터 주입 예시
update public.members set discord_id = '123456789012345678' where member_name = '홍길동';
update public.admins  set discord_id = '123456789012345678' where display_name = '관리자A';
```

### 2단계 — `app/auth/callback/route.ts` 신규
- `GET`에서 `code`, `next`(기본 `/`), `error`/`error_description` 처리
- `code` 없거나 에러면 `/login?error=...`로 redirect
- `const supabase = await createRouteClient()` → `await supabase.auth.exchangeCodeForSession(code)`
- Discord id 추출:
  ```ts
  const discordId =
    user.identities?.find(i => i.provider === 'discord')?.id
    ?? (typeof user.user_metadata?.provider_id === 'string' ? user.user_metadata.provider_id : null)
  ```
- `discordId`가 있으면 `supabaseService`로 링크(RLS 우회):
  1. `members`: `discord_id = discordId` 조회 → `user_id`가 null이거나 동일할 때만 `update({ user_id: user.id })`
  2. `admins`: 동일 처리 ((B) 채택 시 allowlist 조회 후 admins upsert)
  3. 각 단계 에러는 로그인 실패로 만들지 말고 `console.error`만 남기고 진행 (미등록 사용자도 로그인 가능해야 함 — `app/profile/page.tsx`의 `NotRegisteredNotice` 분기 존재)
- `NextResponse.redirect(new URL(next, origin))`
- `next`는 **오픈 리다이렉트 방지: `/`로 시작하고 `//`가 아닌 경우만 허용**
- `export const dynamic = 'force-dynamic'`
- catch는 CLAUDE.md 패턴 준수

### 3단계 — `app/login/page.tsx` 재작성
- `email`/`password` state, form, `signInWithPassword` 전부 삭제
- 기존 세션 리다이렉트(`getSession` → `/`) 유지
- ```ts
  await supabaseClient.auth.signInWithOAuth({
    provider: 'discord',
    options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
  })
  ```
- 에러 표시 영역 유지, "랭킹으로 돌아가기" 버튼 유지
- URL query의 `?error=`를 읽어 콜백 실패 메시지 표시

### 4단계 — `app/admin/login/page.tsx` 재작성
- 인라인 `createBrowserClient` 제거 → `import { supabaseClient } from '@/lib/supabase'`
- `redirectTo: ${origin}/auth/callback?next=/admin/members/sync`
- `window.location.href` 수동 이동 제거

### 5단계 — `app/lib/isAdmin.ts`
- 기존 `user_id` 매칭 유지(1차)
- 미스 시 2차: `user.identities`의 discord id → `admins.discord_id` 조회
- 2차 히트 시 `supabaseService.from('admins').update({ user_id: user.id }).eq('discord_id', discordId)` 자체 치유 후 `{ ok: true }`
- 반환 타입 `RequireAdminResponse` 시그니처 **변경 금지** (호출부 다수)
- `lib/supabase/route.ts`의 `getCurrentAdmin()`도 동일 fallback 권장

### 6단계 — `app/components/AuthButtons.tsx`
- `signOut`, `onAuthStateChange`, `getSession`, 관리자 배지 로직 **그대로 유지**
- `setUserEmail(user?.email ?? null)` → Discord는 email이 없을 수 있으므로 로그인 판별을 **`user` 존재 여부**로 변경. **현재 코드는 email 없으면 로그인 상태인데도 "로그인" 버튼이 뜨는 버그 발생 — 반드시 수정.**
- 표시명: `user.user_metadata.full_name ?? user.user_metadata.name`

### 7단계 — `types/supabase.ts`
- `Member`에 `user_id: string | null`(현재 누락), `discord_id: string | null` 추가
- `Admin`에 `discord_id: string | null` 추가, (A) 채택 시 `id: string` 추가 및 `user_id: string | null`
- `Tables['admins']['Insert']`의 `user_id?: string`도 조정

### 8단계 — 문서/정리
- `CLAUDE.md` 인증 설명, DB 테이블 표 갱신
- `npx tsc --noEmit`, `npm run lint` 통과

## 위험 요소

1. **(높음) `admins.user_id` PK 제약** — 사전 등록 불가 문제. (A)/(B) 택일 필요, FK 참조 여부 미확인. **확인 필요.**
2. **(높음) 기존 이메일 계정 고아화** — Discord 신규 유저는 별개 UUID. discord_id 사전 주입이 선행되지 않으면 **모든 관리자가 잠긴다.** 첫 배포 시 Email provider를 즉시 끄지 말 것(롤백 대비).
3. **(높음) `AuthButtons`의 email 기반 로그인 판별** — Discord가 email을 안 주면 로그인 상태 인식 실패. 6단계에서 수정 필수.
4. **(중) 오픈 리다이렉트** — 콜백 `next` 검증 누락 시 외부 URL 유도 가능.
5. **(중) 계정 탈취 매칭 위험** — 이미 다른 `user_id`가 연결된 행을 무조건 덮어쓰지 말 것. `user_id is null` 또는 동일 값일 때만 갱신.
6. **(중) middleware 부재** — 세션 만료 시 서버 컴포넌트 갱신 안 됨. 후속 과제 권장.
7. **(중) 클라이언트 중복** — `lib/supabase.ts`(무타입) / `lib/supabase/browser.ts`(타입 O) / admin/login 인라인 = 3중. 수렴 필요.
8. **(낮음) 타입 미적용으로 오류 은폐** — `createRouteClient` 제네릭 미적용. 적용 시 신규 타입 에러 다수 가능 → 별도 커밋 권장.
9. **(낮음) PKCE** — `signInWithOAuth` 호출 브라우저와 콜백 수신 브라우저 동일해야 함. `setAll` 구현되어 있어 정상 동작 예상.

## 검증 포인트 (QA)

- [ ] `/login`, `/admin/login`에 이메일·비밀번호 입력창이 **완전히 없다**
- [ ] `grep -rn signInWithPassword app lib` 결과 0건
- [ ] Discord 버튼 → 동의 화면 → `/auth/callback` → `/` 리다이렉트 성공
- [ ] `/admin/login` 경유 시 최종 도착지 `/admin/members/sync`
- [ ] discord_id 사전 등록 멤버 로그인 시 `members.user_id` 자동 채워짐
- [ ] discord_id 사전 등록 관리자 로그인 시 `admins.user_id` 연결 + `GET /api/admin/me` 200
- [ ] 미등록 사용자: 로그인 성공, `/profile`에서 `NotRegisteredNotice`, `/api/admin/me` 403
- [ ] AuthButtons: 로그인 후 "프로필 관리/로그아웃" 노출(email 없는 계정 포함), 관리자면 "관리 페이지"
- [ ] 로그아웃 → 세션 제거 + "로그인"으로 복귀
- [ ] `/auth/callback?next=https://evil.com`이 외부로 리다이렉트되지 않음
- [ ] 다른 user_id가 연결된 members 행이 덮어써지지 않음
- [ ] `npx tsc --noEmit` / `npm run lint` 통과
- [ ] `any` 미사용 (CLAUDE.md 규칙)
- [ ] `/api/profile/*`가 Discord 세션으로 정상 동작
