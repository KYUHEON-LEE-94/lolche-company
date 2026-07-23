# Phase 5 — 스팀 (전체 범위) 구현 결과

Analyst 계획 4절의 "축소판(API 키 없음)"은 폐기하고, Steam Web API 키 기반 **원래 요청 범위 전체**를 구현했다.
(`steam_apps` / `steam_owned_games` 테이블 복원 포함)

## 착수 전 실측 검증 (Steam API, 읽기 전용)

| 엔드포인트 | 결과 |
|---|---|
| `ISteamUser/GetPlayerSummaries/v2/` | 200. `personaname` / `avatarfull` / `communityvisibilitystate` 확인 |
| `ISteamUser/ResolveVanityURL/v1/` | 200. 성공 `success:1`+`steamid`, 실패 `success:42, "No match"` |
| `IPlayerService/GetOwnedGames/v1/` | 200. 비공개 계정은 **`{"response":{}}`** 를 200으로 반환 → 에러와 구분 필요 |
| `store.../api/appdetails?appids=570&filters=categories` | 200. `categories[{id,description}]`, Dota2 = id 1(Multi-player) 포함 |

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|---|---|
| `scripts/sql/20260724_steam.sql` | **신규(미실행)**. members.steam_* 7컬럼 + 유니크 인덱스, `steam_apps`, `steam_owned_games`, RLS(select만), 검증/롤백 주석 |
| `types/supabase.ts` | `Member.steam_*` 7필드, `SteamApp` / `SteamOwnedGame` 타입, `Database.Tables` 2개 등록 |
| `lib/steam/api.ts` | **신규**. `server-only`. GetPlayerSummaries(100개 청크)/GetOwnedGames/ResolveVanityURL |
| `lib/steam/resolveSteamId.ts` | **신규**. `server-only`. 입력 4형태 정규화 + vanity 해석 |
| `lib/steam/appDetails.ts` | **신규**. `server-only`. 비공식 store API로 멀티플레이 판정 |
| `lib/sync/syncSteamMember.ts` | **신규**. 멤버 배치 동기화 + `backfillAppDetails()` + 온디맨드 1인 동기화 |
| `app/api/me/steam/route.ts` | **신규**. GET/POST/DELETE. 세션 user_id로만 대상 행 특정 |
| `app/api/admin/sync-steam/route.ts` | **신규**. GET=크론(Bearer), POST=requireAdmin |
| `app/steam/page.tsx` | placeholder(ComingSoon) 교체. Server Component, `revalidate=300`, 3개 섹션 |
| `app/steam/SteamLinkForm.tsx` | **신규**. `'use client'`. 등록/해제 + 비공개 경고 배지 |
| `middleware.ts` | `BYPASS_PATHS`에 `/api/admin/sync-steam` 추가 |
| `vercel.json` | 크론 `0 11 * * *` 추가 (sync-all 09:30과 미충돌) |
| `next.config.ts` | `avatars.steamstatic.com`, `cdn.cloudflare.steamstatic.com` remotePatterns 추가 |
| `app/page.tsx` | 스팀 카드 `ready: false` → `true`, 설명 갱신 |
| `app/api/admin/members/[id]/route.ts` | `CHILD_TABLES`에 `steam_owned_games` 추가 (추방 시 명시적 정리) |
| `CLAUDE.md` | 디렉토리·환경변수·DB 테이블·동기화 흐름·노출 필터·주의사항 갱신 |

> `app/components/SiteNav.tsx`는 이미 `/steam` 링크가 있어 변경 불필요(롤과 달리 플래그 없음).

## 주요 구현 내용

### 1. 캐싱 — 페이지 렌더 시 Steam API 호출 0건
`app/steam/page.tsx`는 `members` + `steam_owned_games !inner steam_apps` 두 쿼리만 실행한다.
PostgREST 1000행 상한 때문에 `range()`로 최대 20페이지 순회(멤버 18명 × 수백 게임 대응).
Steam API 호출은 **크론(`/api/admin/sync-steam`)과 스팀 최초 등록 시점**에만 발생한다.
`playtime_2weeks`는 `GetOwnedGames` 응답에 포함되므로 `GetRecentlyPlayedGames`를 호출하지 않는다.
`GetPlayerSummaries`는 전 멤버를 100개 청크 1회 호출로 처리한다(멤버당 1회 아님).

### 2. 3개 섹션
- **함께 할 수 있는 게임** — appid별 보유자 집계, `is_multiplayer === false`(싱글 확정)만 제외, 2명 이상 보유, 보유자 수 내림차순 24개. `is_multiplayer === null`은 "분류 미확인" 배지와 함께 노출.
- **최근 2주 플레이** — `playtime_2weeks > 0` 멤버를 합계 내림차순, 상위 3개 게임 표시.
- **보유 게임 수 / 총 플레이타임 랭킹** — 각 상위 10명.

### 3. 인증 없는 스팀 ID 등록
`parseSteamInput()`이 4형태를 모두 처리: `^\d{17}$` / `/profiles/{17자리}` / `/id/{vanity}` / 맨 vanity.
URL 형태인데 두 패턴에 안 걸리면 vanity로 오인하지 않고 400으로 거절한다.
없는 vanity → 400, 이미 등록된 SteamID64 → 409(사전 조회 + 유니크 위반 `23505` → 409 변환).
`communityvisibilitystate !== 3`이면 등록은 허용하되 폼과 페이지 양쪽에 "프로필 비공개" 경고를 띄운다.
관리자 승인 게이트 없음(계획 판정 ⑦).

### 4. 보안
- `STEAM_API_KEY`는 `NEXT_PUBLIC_` 없이 서버 전용. `lib/steam/*.ts` 3개 파일 모두 `import 'server-only'`.
- Steam Web API는 헤더 인증을 지원하지 않아 키가 쿼리 파라미터로 나간다 → **에러 메시지/로그에 URL을 싣지 않고** path만 기록한다.
- `/api/me/steam`은 body의 member id를 신뢰하지 않고 세션 `user_id`(보조로 `user_id is null`인 `discord_id` 행)로만 대상 행을 특정한다.
- 공개 조회·동기화 대상 모두 `.eq('status','approved')` 적용.
- 마이그레이션 RLS는 `select` 정책만 생성. insert/update/delete 정책 없음(모든 쓰기 service role).

### 5. 실패 격리
- 한 멤버 동기화 실패가 배치를 중단시키지 않고 `steam_sync_error`에 기록된다.
- `backfillAppDetails()`는 별도 try/catch로 감싸 비공식 store API 장애가 전체 동기화를 실패로 만들지 않는다.
- store API 실패 시에도 `details_checked_at`은 찍어 무한 재시도를 막고 `is_multiplayer`는 `null`로 남긴다(=분류 미확인).
- 호출 간격: 멤버 400ms, appdetails 1500ms(배치당 40개 상한). 전부 env로 조정 가능.

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 (0건) |
| `npm run lint` | ✅ 0 errors / 9 warnings — **전부 기존 파일의 사전 존재 경고**, 신규 파일 경고 0 |
| `npm run build` | ✅ 통과. `/steam` = ○(prerender, 5m revalidate), `/api/me/steam`·`/api/admin/sync-steam` = ƒ |
| 마이그레이션 미실행 상태 degrade | ✅ REST 실측: `members?steam_id64=not.is.null` → **400**, `steam_owned_games` → **404**. `loadSteamData()`가 throw 대신 `{ok:false}`를 반환해 "스팀 데이터를 아직 사용할 수 없습니다" 안내로 degrade. 빌드 타임 프리렌더도 500 없이 성공 |
| 키 노출 검사 | ✅ `.next/static`·`.next/server` 전체 grep에서 `STEAM_API_KEY` 값 **0건**. `curl /steam` 응답에도 0건 |
| 무인증 접근 | ✅ `GET /api/me/steam` → 401, `GET /api/admin/sync-steam` → 401 |
| 기존 페이지 회귀 | ✅ 빌드 라우트 목록 변동 없음(추가만). 기존 파일 수정은 `app/page.tsx` 카드 플래그 1줄, `CHILD_TABLES` 1줄, `middleware`/`vercel.json`/`next.config` 설정 추가뿐 |
| DB 쓰기 | ✅ 없음. Steam API는 읽기 호출만 수행 |

## 배포 전 필수 절차

1. **`scripts/sql/20260724_steam.sql`을 Supabase SQL Editor에서 먼저 실행** (SQL 먼저 → 배포 나중).
   미실행 상태로 배포해도 `/steam`은 500 대신 안내 문구로 degrade하지만 기능은 동작하지 않는다.
2. Vercel 환경변수에 `STEAM_API_KEY` 등록 (`NEXT_PUBLIC_` 금지).
3. 배포 후 `POST /api/admin/sync-steam`(관리자)으로 최초 적재 1회 실행 권장.
   앱 판정은 배치당 40개씩이므로 보유 게임이 많으면 며칠에 걸쳐 "분류 미확인"이 줄어든다.

## 미구현 / 범위 외

- **관리자 화면의 스팀 동기화 버튼** — `/admin/members/sync` UI 추가는 요청 범위 밖. `POST /api/admin/sync-steam`으로 수동 실행 가능.
- **로그인 상태 `/steam` 실렌더 확인** — 사이트 전체가 Discord 로그인 게이트(middleware)이고 로컬 세션이 없어 브라우저 렌더는 확인하지 못했다. 빌드 타임 프리렌더(비로그인 경로)에서 degrade 동작은 확인함.
- **스팀 온라인/게임 중 상태 표시** — 축소판 계획에만 있던 항목. 요청된 3개 섹션(공통 게임/최근 플레이/랭킹)에 집중했다. 필요 시 `personastate`/`gameextrainfo`를 `GetPlayerSummaries`에서 추가로 뽑으면 되지만 실시간성이 필요해 크론 캐시(하루 1회)와 상성이 나쁘다.
