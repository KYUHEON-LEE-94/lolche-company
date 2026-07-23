# Phase 1 구현 결과 — 네비게이션 + 대시보드

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|-----------|---------|
| `app/page.tsx` → `app/tft/page.tsx` | git mv. `revalidate = 60` 유지. 함수명 `HomePage` → `TftRankingPage` |
| `app/MemberRanking.tsx` → `app/tft/MemberRanking.tsx` | git mv. import 경로는 전부 `@/` 절대 별칭이라 수정 불필요. 인라인 헤더 제거에 따라 `AuthButtons`, `next/link` import 삭제 |
| `app/page.tsx` (신규) | 메인 대시보드 Server Component. `revalidate = 60` |
| `app/components/SiteNav.tsx` (신규) | 전역 네비게이션. Client Component, `usePathname` active 표시 |
| `app/components/ComingSoon.tsx` (신규) | `/lol`·`/steam` placeholder 공용 UI |
| `app/lol/page.tsx` (신규) | "준비 중" placeholder |
| `app/steam/page.tsx` (신규) | "준비 중" placeholder |
| `app/layout.tsx` | `<SiteNav />` 를 `<body>` 최상단에 삽입 |
| `app/custom-games/page.tsx` | 자체 헤더의 `href="/"` (라벨 "홈") → `href="/tft"` (라벨 "롤체 랭킹") |
| `app/api/profile/image/route.ts` | `revalidatePath('/')` → `'/tft'` |
| `app/api/profile/frame/route.ts` | `revalidatePath('/')` ×2 → `'/tft'` |
| `app/api/admin/profile-frames/upload/route.ts` | `revalidatePath('/')` → `'/tft'` |
| `app/api/admin/profile-frames/delete/route.ts` | `revalidatePath('/')` → `'/tft'` |
| `app/api/admin/members/create/route.ts` | `'/tft'` 추가 + `'/'` 유지 |
| `app/api/admin/members/update/route.ts` | `'/tft'` 추가 + `'/'` 유지 |
| `app/api/admin/members/[id]/route.ts` (DELETE) | `'/tft'` 추가 + `'/'` 유지 |
| `app/api/admin/members/[id]/approve/route.ts` | `'/tft'` 추가 + `'/'` 유지 (2곳) |
| `app/api/admin/members/[id]/reject/route.ts` | `'/tft'` 추가 + `'/'` 유지 |
| `app/api/me/member/route.ts` | `'/tft'` 추가 + `'/'` 유지 (4곳) |

## 주요 변경 사항

### 1. 라우트 이동
`/` 랭킹 → `/tft`. 미들웨어·`auth/callback` 무변경 (계획대로 `/`가 계속 로그인 후 목적지).

### 2. SiteNav — route group 대신 pathname 가드 채택
`app/(main)/layout.tsx` route group을 검토했으나, `page.tsx`·`custom-games`·`hall-of-fame`·`profile`·`tft` 5개를
한꺼번에 옮겨야 해 diff가 과도하게 커지고 Phase 2~6 충돌 위험이 있어 **pathname 가드**로 결정.

- `app/layout.tsx`에서 항상 `<SiteNav />` 렌더
- `SiteNav`는 `HIDDEN_PREFIXES = ['/admin', '/login', '/auth']` 에서 `null` 반환
- SSR 단계에서도 `usePathname()`이 동작하므로 `/login`·`/admin/*` HTML에 nav 마크업이 아예 포함되지 않음 (curl로 검증, 아래)
- active 판정: `/`는 exact, 나머지는 prefix

### 3. MemberRanking 인라인 헤더 제거
구 `app/MemberRanking.tsx:512-523`의 "내전 링크 + AuthButtons" 블록 삭제 → SiteNav로 흡수.
미사용이 된 `AuthButtons` / `next/link` import도 함께 제거.

### 4. revalidatePath 전수 처리 — 실측 **13곳** (계획서 9곳과 차이 있음)
grep 결과 `revalidatePath('/')`는 9곳이 아니라 **13곳**이었다. 추가 4곳은 프로필/프레임 계열:
`api/profile/image`(1), `api/profile/frame`(2), `api/admin/profile-frames/upload`(1), `.../delete`(1).

처리 원칙을 두 갈래로 나눴다.

- **랭킹만 영향** (프로필 이미지·프레임 5곳) → `'/'` 를 `'/tft'` 로 **치환**
- **대시보드 지표에도 영향** (멤버 CRUD·승인/거절/추방·자가등록 8곳) → `'/tft'` 를 **추가**하고 `'/'` 도 **유지**
  (대시보드가 "승인 멤버 수"를 표시하므로 `'/'` 무효화가 필요)

`approve/route.ts`의 `if (!syncWarning) revalidatePath('/tft')` 는 블록으로 감싸 `'/'` 도 동일 조건에 묶었다
(동기화 실패 시 재검증하지 않던 기존 동작 보존).

### 5. 대시보드 (`app/page.tsx`)
- 요약 지표 3종: 승인 멤버 수(`count: 'exact', head: true` + `.eq('status','approved')`), 현재 시즌(`is_active`), 최근 동기화 시각(승인 멤버 중 `last_synced_at` 최댓값 1행)
- 카드 네비게이션 5종. `/lol`·`/steam` 카드에는 "준비 중" 배지. 링크는 살아 있고 placeholder 페이지가 있으므로 **404 없음**
- 무거운 쿼리 없음(멤버 전체 로드 안 함), `revalidate = 60`
- service role(`supabaseService`)은 Server Component에서만 사용, Client Component 유입 없음

## 발견 사항 / 주의

**⚠ `types/supabase.ts`의 `Database` 제네릭이 select 결과를 추론하지 못한다 (전역 이슈).**
`supabaseService.from('seasons').select('*')` / `.from('members')...maybeSingle()` 모두 `data`가 `never`(또는 `null`)로 추론된다.
기존 코드는 `app/tft/page.tsx`의 `(data ?? []) as Member[]` 처럼 캐스팅으로 우회하고 있어 드러나지 않았을 뿐이다.
신규 대시보드도 동일 패턴(`as Pick<Season,...> | null`)으로 처리하고 주석을 남겼다.
**Phase 2에서 `riot_accounts` 타입을 추가할 때 근본 수정(Relationships 키 보강 등)을 검토할 것.**

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 (0 에러) |
| `npm run lint` | ✅ 0 errors / 9 warnings — 전부 기존 파일의 선행 경고 |
| `npm run build` | ✅ 성공. `/tft`(1m revalidate), `/`(1m revalidate), `/lol`, `/steam` 라우트 등록 확인 |
| `any` 사용 | ✅ 신규 코드 0건 |

### 라우트 응답 (dev 서버, 비로그인)
```
/                307 → /login?next=%2F
/tft             307 → /login?next=%2Ftft
/custom-games    307 → /login?next=%2Fcustom-games
/hall-of-fame    307 → /login?next=%2Fhall-of-fame
/lol             307 → /login?next=%2Flol
/steam           307 → /login?next=%2Fsteam
```
전부 미들웨어 로그인 게이트에 정상 진입 (우회 없음).

### SiteNav 미노출 확인
`curl /login`, `curl /admin/login` HTML 내 nav 항목("명예의 전당") 출현 0회.

### 빌드 시 임시 조치
dev 서버가 `.next`를 점유해 `next build`가 ENOTEMPTY로 실패하여,
`next.config.ts`에 `distDir` 임시 주입 후 `NEXT_DIST_DIR=.next-build`로 빌드 → **검증 후 `git checkout next.config.ts`로 원복 완료.**
현재 `next.config.ts`는 변경 없음.

## 미구현 항목
없음. Phase 1 범위 전량 구현. Phase 2~6 관련 파일은 일절 건드리지 않았다.

## QA 집중 테스트 항목
1. 로그인 후 `/` 대시보드 지표 3종이 실제 DB 값과 일치하는지 (승인 멤버 수는 `status='approved'`만)
2. 관리자 승인/거절/추방 후 `/tft`와 `/` 양쪽이 60초 내 갱신되는지 (revalidate 경로 이중화 확인)
3. `/admin/*`, `/login`에 SiteNav가 보이지 않는지
4. `/custom-games` 자체 sticky 헤더와 SiteNav가 시각적으로 충돌하지 않는지 (SiteNav는 non-sticky)
5. `/tft` 상단에서 기존 내전 버튼이 사라지고 SiteNav로 이동 가능한지
