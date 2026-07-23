# 롤체 컴퍼니 (lolche-company)

카카오톡 단톡방 멤버 전용 TFT(Teamfight Tactics) 랭킹 추적 서비스.
Riot Games API로 TFT 솔로/더블업 랭크를 동기화하고 실시간 리더보드를 제공한다.

## 기술 스택

- **프레임워크:** Next.js 16 (App Router) + React 19 + TypeScript 5
- **데이터베이스:** Supabase (PostgreSQL)
- **외부 API:** Riot Games TFT API
- **스타일:** Tailwind CSS v4 + Framer Motion
- **인증:** Supabase Auth — Discord OAuth 전용 (이메일/패스워드 로그인 미지원)
- **배포:** Vercel (크론 매일 09:30 자동 동기화)

## 빌드/실행 명령어

```bash
npm run dev       # 개발 서버 (localhost:3000)
npm run build     # 프로덕션 빌드
npm run lint      # ESLint 검사
npx tsc --noEmit  # TypeScript 타입 검사
```

## 디렉토리 구조

```
app/
  page.tsx                      # 홈 (랭킹 목록, Server Component, ISR 60s)
  MemberRanking.tsx             # 랭킹 UI (Client Component)
  layout.tsx                    # 루트 레이아웃
  components/                   # 공용 컴포넌트
    AuthButtons.tsx             # 로그인/로그아웃/관리자 버튼
    Spinner.tsx                 # 로딩 스피너
    TierPanel.tsx
    ranking/HallOfFameCard.tsx
  admin/                        # 관리자 전용 (인증 필요)
    layout.tsx                  # 관리자 사이드바 레이아웃
    members/
      control/page.tsx          # 멤버 등록·수정·삭제
      sync/page.tsx             # 멤버 동기화 현황
    seasons/page.tsx            # 시즌 관리
    profile-frames/             # 프로필 프레임 관리
  steam/                        # 스팀 (함께 할 수 있는 게임·최근 플레이·보유/플레이타임 랭킹)
    page.tsx                    # Server Component, revalidate 300s. **DB만 조회 — Steam API 호출 0건**
    SteamLinkForm.tsx           # 스팀 ID 등록/해제 폼 (Client Component)
  hall-of-fame/                 # 명예의 전당 (시즌 기록)
  login/                        # 사용자 로그인 (Discord OAuth 버튼)
  auth/callback/route.ts        # OAuth 코드 교환 + discord_id ↔ user_id 연결
  profile/                      # 프로필 이미지·프레임 편집 + 라이엇 ID 자가 등록
    MemberSelfForm.tsx          # 라이엇 ID 등록/수정 폼 + 계정 목록(최대 3, 추가/수정/삭제/대표지정)
  api/                          # API 라우트
    me/member/route.ts          # 내 멤버 조회(GET) / 자가 등록·수정(POST, 세션 소유권 기반)
    me/riot-accounts/           # 내 라이엇 계정(최대 3) — 전부 세션 user_id로만 소유권 판정
      route.ts                  #   GET 목록 / POST 추가(빈 슬롯 최솟값, 23505→409)
      [id]/route.ts             #   PATCH 수정 / DELETE 삭제(마지막 1개는 409)
      [id]/primary/route.ts     #   POST 대표 지정 (set_primary_riot_account RPC)
    me/steam/route.ts           # 내 스팀 연결 조회(GET)/등록(POST)/해제(DELETE) — 세션 소유권 기반
    members/[id]/
      sync/route.ts             # 개별 멤버 동기화 (쿨다운 + 관리자/본인 인증)
      matches/route.ts          # 최근 매치 조회 (tft_matches !inner 조인, 단일 쿼리)
      history/route.ts          # 랭크 히스토리 조회
    admin/
      sync-all/route.ts         # 전체 멤버 동기화 (GET=크론, POST=수동)
      sync-steam/route.ts       # 스팀 캐시 동기화 (GET=크론, POST=관리자)
      members/                  # 멤버 CRUD API (route=목록, create/update/[id])
        [id]/approve/route.ts   # 승인 + 즉시 동기화
        [id]/reject/route.ts    # 거절 + 사유
      profile-frames/           # 프레임 업로드·삭제 API
    profile/                    # 프로필 이미지·프레임 저장 API (service role 경유)

lib/
  supabase.ts                   # anon 클라이언트 + 브라우저 클라이언트
  supabaseAdmin.ts              # service role 클라이언트 (서버 전용)
  supabase/
    service.ts                  # supabaseService (service role, 서버 전용)
    browser.ts                  # createClient factory (브라우저)
  riot/
    api.ts                      # Riot API 클라이언트 (X-Riot-Token 헤더 인증)
  steam/                        # ⚠ 전부 `import 'server-only'` — STEAM_API_KEY 클라이언트 노출 금지
    api.ts                      # Steam Web API (GetPlayerSummaries / GetOwnedGames / ResolveVanityURL)
    resolveSteamId.ts           # 입력 4형태 → SteamID64 정규화
    appDetails.ts               # store appdetails(비공식)로 멀티플레이 판정
  sync/
    syncMember.ts               # 재시도 + 지수 백오프 래퍼
    doSyncMember.ts             # Riot API 실제 호출 + DB 업데이트
    syncSteamMember.ts          # 스팀 프로필·보유 게임 적재 + steam_apps 백필
    writeSyncLog.ts             # sync_logs 테이블 감사 로그
  actions/
    season-actions.ts           # 시즌 Server Actions
  members/
    memberInput.ts              # 멤버 입력 화이트리스트 파서 + 길이/포맷 검증 상수 (+ parseRiotAccountInput)
    primaryAccount.ts           # ★ 대표 계정 파생 + members 캐시 미러링 단일 지점 + 재승인 정책 상수
    myMember.ts                 # 세션 → 내 members 행 해석 (body의 member 식별자 불신)
  tft/
    tftLocale.ts                # 기물 이미지 URL 생성, 한국어 이름 변환 (KrMaps 캐시)

app/lib/
  isAdmin.ts                    # requireAdmin() — 세션 확인 + admins 테이블 체크

types/
  supabase.ts                   # DB 전체 TypeScript 스키마
```

## 환경 변수 (.env.local)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # 서버 전용, 클라이언트 노출 금지
RIOT_API_KEY=                       # RGAPI-...
RIOT_ACCOUNT_BASE_URL=              # https://asia.api.riotgames.com/...
RIOT_TFT_LEAGUE_BASE_URL=           # https://kr.api.riotgames.com/...
RIOT_TFT_MATCH_BASE_URL=            # https://asia.api.riotgames.com/...
RIOT_LOL_LEAGUE_BASE_URL=           # https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid
NEXT_PUBLIC_LOL_ENABLED=false       # LoL 기능 전체 on/off (기본 false)
STEAM_API_KEY=                      # ⚠ 서버 전용. NEXT_PUBLIC_ 접두사 절대 금지
STEAM_SYNC_BATCH=50                 # 1회 스팀 동기화 멤버 수
STEAM_MEMBER_DELAY_MS=400           # 멤버 간 호출 간격(ms)
STEAM_APP_DETAIL_BATCH=40           # 1회 실행에서 멀티플레이 판정할 신규 앱 수
STEAM_APP_DETAIL_DELAY_MS=1500      # 비공식 store API 호출 간격(ms)
ADMIN_SYNC_TOKEN=                   # 크론 트리거용 시크릿 (CRON_SECRET 없을 때 fallback)
CRON_SECRET=                        # Vercel Cron 전용 시크릿 (설정 시 ADMIN_SYNC_TOKEN보다 우선)
RIOT_MATCH_DETAIL_DELAY_MS=1200     # 매치 API 호출 간격(ms)
RIOT_MEMBER_DELAY_MS=800            # 멤버 간 · 라이엇 계정 간 호출 간격(ms)
SYNC_ALL_BATCH=10                   # 1회 전체 동기화 멤버 수 (계정 최대 3개 감안해 20→10)
NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC=300  # 프론트 쿨다운 표시용
```

### LoL 기능 플래그 — `NEXT_PUBLIC_LOL_ENABLED`

Riot 프로덕션 키는 제품 단위로 승인된다. 현재 이 키는 TFT만 승인되어 있어
`lol/league/v4/entries/by-puuid`, `lol/summoner/v4/*` 가 **403**을 반환한다.
따라서 LoL 기능은 전부 구현되어 있으나 플래그로 잠겨 있다 (`lib/constants/features.ts` → `LOL_ENABLED`).

| 위치 | false일 때 동작 |
|---|---|
| `app/components/SiteNav.tsx` | "롤" 항목 미렌더 |
| `app/page.tsx` 대시보드 | 롤 카드 미렌더 |
| `app/lol/page.tsx` | `notFound()` → **404** (URL 직접 접근 차단) |
| `lib/sync/doSyncMember.ts` | LoL 조회 단계 자체를 건너뜀 (불필요한 403 방지) |

Riot 승인 후 `NEXT_PUBLIC_LOL_ENABLED=true` + 재빌드만으로 전체 활성화된다 (코드 수정 불필요).
`fetchLolLeaguesByPuuid()`는 403을 재시도하지 않고 `console.warn` 1회 후 `null`을 반환해
기존 저장값을 덮어쓰지 않고 degrade한다.

## Supabase 클라이언트 사용 규칙

| 클라이언트 | import 위치 | 사용처 |
|---|---|---|
| `supabase` | `@/lib/supabase` | Server Component (anon, 공개 데이터) |
| `supabaseClient` | `@/lib/supabase` | Client Component (브라우저, 인증 포함) |
| `supabaseService` | `@/lib/supabase/service` | Server Component / Server Action (service role) |
| `supabaseAdmin` | `@/lib/supabaseAdmin` | API Route / Sync 로직 (service role) |

> **주의:** `supabaseService`, `supabaseAdmin`은 service role key를 사용하므로
> 절대 클라이언트 컴포넌트에서 import하지 않는다.

## 동기화 흐름

```
[프론트 동기화 버튼]
  → POST /api/members/[id]/sync
      → 인증 체크 (로그인 필수 + 본인 소유 멤버 또는 requireAdmin())
      → 쿨다운 체크 (MIN_SYNC_INTERVAL_SEC)
      → syncOneMember() — 재시도 래퍼 (최대 5회, 지수 백오프)
          → doSyncMember()
              → fetchPuuid()            Riot Account API
              → fetchTftLeaguesByPuuid() Riot TFT League API
              → fetchMatchIdsByPuuid()   Riot TFT Match API
              → fetchMatchById() × N    매 호출마다 1200ms 대기
          → members 테이블 업데이트
          → tft_matches, tft_match_participants 업데이트
      → writeSyncLog() — sync_logs 테이블 기록

[Vercel Cron 09:30 KST]
  → GET /api/admin/sync-all (Authorization: Bearer CRON_SECRET 또는 ADMIN_SYNC_TOKEN)
      → (stale AND not-running) OR stuck-running 멤버 배치 동기화
      → doCleanup=true: sync_logs TTL 정리 (success 7일, 나머지 30일)

[관리자 수동 실행]
  → POST /api/admin/sync-all (requireAdmin() 세션 체크)
      → 위와 동일한 배치 동기화, doCleanup=false

[스팀 — Vercel Cron 11:00 KST] (sync-all 09:30과 겹치지 않게 배치)
  → GET /api/admin/sync-steam (Authorization: Bearer CRON_SECRET 또는 ADMIN_SYNC_TOKEN)
      → listSteamMembers()  status='approved' + steam_id64 not null
      → GetPlayerSummaries 1회(≤100명 배치)로 persona/avatar/visibility 갱신
      → visibility!==3 이면 보유 게임 캐시를 비우고 steam_sync_error='프로필 비공개'
      → GetOwnedGames(include_appinfo, playtime_2weeks 포함) → steam_apps upsert + steam_owned_games 교체
      → backfillAppDetails(): details_checked_at is null 인 앱만 소량 배치로 멀티플레이 판정
  → POST /api/admin/sync-steam 은 requireAdmin() 수동 실행 (동일 로직)
  → 스팀 최초 등록 시 POST /api/me/steam 이 해당 멤버 1명만 온디맨드 동기화

[관리자 승인]
  → POST /api/admin/members/[id]/approve
      → status='approved' 확정 후 syncOneMember() 직접 호출
      → 동기화 실패는 롤백하지 않고 syncWarning으로만 반환
```

## Riot API 인증 및 에러 처리

**인증:** `lib/riot/api.ts`의 `riotFetch()`가 모든 요청에 `X-Riot-Token: ${RIOT_API_KEY}` 헤더를 추가한다.
URL 쿼리 파라미터(`?api_key=`)로 전송하지 않는다 — 서버 로그 노출 방지.

**에러 처리:**
- `429`: `Retry-After` 헤더 존중, 없으면 30초 대기 후 재시도
- `502/503/504`: 재시도 가능 상태코드
- 나머지: 즉시 실패 처리
- `RiotApiError` 클래스 (`lib/riot/api.ts`), `SyncError` 클래스 (`lib/sync/syncMember.ts`)

## 코드 규칙

- **타입:** `any` 사용 금지. catch 블록은 `catch (e)` + `e instanceof Error ? e.message : 'fallback'` 패턴 사용
- **Supabase 쿼리:** 필요한 컬럼만 `select`로 지정 (Server Component에서 `*` 지양). 관계 테이블 조인은 `!inner` 임베디드 선택 사용 (N+1 방지)
- **API 입력 검증:** 관리자 API의 문자열 입력은 빈값 체크 + 최대 길이 제한 필수 (`member_name` 50자, `riot_game_name` 30자, `riot_tagline` 10자)
- **catch 패턴:**
  ```ts
  // ❌ 금지
  catch (e: any) { ... e.message ... }

  // ✅ 올바른 패턴
  catch (e) { someHandler(e instanceof Error ? e.message : '오류 발생') }
  ```
- **Server Action:** `lib/actions/` 폴더, 파일 상단에 `'use server'` 선언
- **Server Action 권한 체크:** 데이터 변경(insert/update/delete) Server Action은 반드시 함수 첫 줄에 `requireAdmin()` 호출. 미체크 시 인증 없이 DB 조작 가능.
  ```ts
  const { ok } = await requireAdmin()
  if (!ok) return { ok: false, message: '관리자 권한이 필요합니다.' }
  ```
- **Client Component:** 파일 상단에 `'use client'` 선언
- **이미지:** `<img>` 대신 `next/image`의 `<Image />` 사용 (외부 URL 허용 도메인: `**.supabase.co`)

## DB 주요 테이블

| 테이블 | 설명 |
|---|---|
| `members` | **사람** 1행. 로그인 연결(`discord_id`/`user_id`) + `status` 승인 워크플로 + **대표 계정 랭크 캐시**(`riot_*`/`tft_*`/`lol_*`) |
| `riot_accounts` | **계정** 1~3행 (`account_no` 1~3 슬롯 유니크). `is_primary`로 대표 지정. 계정별 실제 랭크값 보관 |
| `admins` | 관리자 계정 (`discord_id` 사전 등록, 첫 로그인 시 `user_id` 자동 연결) |
| `seasons` | 시즌 목록 (`is_active` 하나만 true 가능) |
| `hall_of_fame` | 시즌 마감 시점의 랭크 스냅샷 (+`member_name_snapshot`으로 추방 후에도 이름 보존) |
| `profile_frames` | 프로필 프레임 메타데이터 |
| `tft_matches` | 매치 메타데이터 |
| `tft_match_participants` | 멤버별 매치 결과 |
| `sync_logs` | 동기화 감사 로그 |
| `custom_games` | 내전 모집글 (`host_member_id`, `game_kind`, `capacity`, `scheduled_at`, `status`) |
| `custom_game_participants` | 참가 신청. **확정/대기 컬럼 없음** — `(joined_at, id)` 순번에서 파생 |
| `custom_game_guests` | 내전 게스트 (`riot_puuid` 보유 → TFT 전용 개념) |
| `custom_game_rounds` / `_results` / `_guest_results` / `_teams` | TFT 내전 라운드·결과·팀 배정 |
| `steam_apps` | 스팀 앱 메타 + `is_multiplayer` 3-값 캐시 (true/false/null=분류 미확인). 앱당 1회 조회 후 영구 보관 |
| `steam_owned_games` | 멤버별 보유 게임 + `playtime_forever`/`playtime_2weeks`(분). `/steam`이 읽는 유일한 소스 |

`members.steam_*` (20260724_steam.sql): `steam_id64`(유니크), `steam_persona`, `steam_avatar_url`,
`steam_visibility`(=`communityvisibilitystate`, 3이면 공개), `steam_linked_at`, `steam_synced_at`, `steam_sync_error`.

## 멤버 자가 등록 / 승인 워크플로

`members.status`는 `'pending' | 'approved' | 'rejected'` 세 값만 가진다 (`MemberStatus`).

```
[사용자] /profile → MemberSelfForm → POST /api/me/member
    → 대상 행은 오직 세션 user_id로 특정 (body의 id는 절대 신뢰하지 않음)
    → member_name / riot_game_name / riot_tagline 3개 컬럼만 화이트리스트로 수용
    → 항상 status='pending'. 승인된 멤버가 Riot ID를 바꿔도 pending 복귀
       (REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE 상수로 제어 — 랭킹 조작 방지)
    → 이 폼이 다루는 Riot ID는 항상 **대표 계정**이다. ensurePrimaryAccount()로
       riot_accounts slot1을 함께 정합화하고 mirrorPrimaryToMember()로 캐시를 재기록한다
       (부계정은 /api/me/riot-accounts 담당)

[관리자] /admin/members/control
    → GET  /api/admin/members[?status=pending]  대기/전체 탭, 로그인 연결 배지
    → POST /api/admin/members/[id]/approve      승인 + 즉시 동기화
    → POST /api/admin/members/[id]/reject       거절 + 사유(≤200자)
    → DELETE /api/admin/members/[id]            추방 (body.confirmName === member_name 필수)
```

## 다중 라이엇 계정 · 대표 계정 (`riot_accounts`)

`scripts/sql/20260726_riot_accounts.sql`. 멤버당 라이엇 계정 최대 3개, 그중 **대표 1개만** 공개 랭킹에 노출된다.

### members는 계속 1인 1행이다 ★

`members`가 사람 축을 유지하므로 `getViewerMember()`·`findMyMember()`의 `.maybeSingle()`,
`unique(custom_game_id, member_id)`, `members.steam_id64` 유니크가 전부 무변경으로 유효하다.
`members.riot_*`/`tft_*`/`lol_*`는 **대표 계정 값의 비정규화 캐시**다.
덕분에 `/`, `/tft`, `/lol`, `/steam`, `/hall-of-fame`, 내전의 공개 쿼리에 대표 계정 필터를 한 줄도 추가하지 않는다.

> 불변식이 코드가 아니라 **데이터**에 걸린다: `members.tft_* == 대표 riot_accounts.tft_*`.
> **캐시 갱신은 `lib/members/primaryAccount.ts`의 `mirrorPrimaryToMember()` 한 곳에서만 한다.**
> 다른 곳에서 `members.tft_*`를 직접 쓰면 랭킹에 옛 값이 남는다.

### 제약은 전부 DB가 강제한다

| 규칙 | 방어선 |
|---|---|
| 최대 3개 | `unique (member_id, account_no)` + `check (account_no between 1 and 3)`. 앱의 select→insert는 동시요청에 반드시 뚫린다 |
| 대표 ≤1 | `unique (member_id) where is_primary` |
| 타인 계정 선점 | `unique (riot_puuid)`, `unique (lower(game_name), lower(tagline))` |
| 대표 ≥1 | **강제하지 않는다.** 아래 파생 규칙으로 "대표 없음"을 관측 불가능하게 만든다 |

전부 `23505` → **409** 매핑.

### 대표는 파생한다 — 자동 승격 UPDATE를 만들지 않는다 ★

`is_primary desc, account_no asc` 정렬의 첫 행이 대표다 (`pickPrimaryAccount()` / 뷰 `member_primary_account`).
`is_primary`가 전부 false여도 `account_no` 최솟값이 대표가 되므로 대표 삭제 시 승격 UPDATE가 필요 없고,
따라서 승격 경합도 존재하지 않는다(내전 대기열과 같은 철학).
대표 **전환**만은 파생 불가라 `is_primary` 플래그가 필요하며,
부분 유니크 인덱스가 비지연이라 해제→지정 2문장을 `set_primary_riot_account()` RPC 한 트랜잭션으로 처리한다.

### 재승인 정책

| 행위 | `members.status` |
|---|---|
| 부계정 추가 / 부계정 수정 / 부계정 삭제 | **불변** (공개 노출값이 안 바뀐다) |
| 대표 계정의 Riot ID **문자열** 수정 | `REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE = true` → **pending 복귀** |
| 대표 계정 **전환**(다른 계정을 대표로) | `REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH = false` → **불변**(운영 결정) |
| 대표 계정 삭제(파생 대표 교체) | 위 상수를 공유 |

두 상수 모두 `lib/members/primaryAccount.ts`에 있다. 정책 반전은 상수 1개 변경으로 끝난다.
`PRIMARY_SWITCH`를 `true`로 올리면 "부계정 추가 → 대표 전환"으로 심사를 우회하는 경로가 닫힌다.
**pending 복귀는 반드시 캐시 갱신과 짝으로 수행한다** — 옛 값을 남기면 승인 순간 "심사한 계정 ≠ 표시되는 값"이 된다.

**마지막 1개 계정은 삭제 거부(409).** 0개가 되면 캐시를 갱신할 근거가 사라져 랭킹에 옛 값이 영구히 남는다.

**RLS:** `riot_accounts`는 **select 정책만** 둔다. self-UPDATE 정책이 있으면 사용자가 콘솔에서
`is_primary`/`tft_tier`를 직접 바꿔 위 재승인 규칙을 통째로 우회한다.

### 동기화 부하

- 리그 조회(`fetchTftLeaguesByPuuid`)만 계정 수에 비례 (계정 간 `RIOT_MEMBER_DELAY_MS` 대기)
- **매치 상세(건당 1200ms)·LoL·`member_rank_history`는 대표 계정만** — 비용의 대부분이 매치 상세다
- `SYNC_ALL_BATCH` 기본값 **10** (계정 3배를 감안해 20에서 하향)
- 개별 동기화 쿨다운은 계정 수와 무관하게 `members.last_synced_at`(사람 단위) 기준 유지

### 마이그레이션 미적용 시 degrade

테이블 부재는 Postgres `42P01` / PostgREST `PGRST205`로 나타난다.
`isMissingTableError()`가 이를 잡아
`/profile`·`GET /api/me/riot-accounts`는 500이 아니라 "마이그레이션 필요" 안내,
쓰기 라우트는 503, **`doSyncMember()`는 기존 단일 계정 경로로 폴백**한다(크론이 죽으면 안 된다).

**노출 필터:** `app/tft/page.tsx`, `app/lol/page.tsx`, `app/steam/page.tsx`,
그리고 `lib/sync/syncSteamMember.ts`의 `listSteamMembers()`에서 `.eq('status','approved')`.
이 지점들이 미승인 멤버 차단의 핵심이므로 members를 조회하는 공개 화면·집계를 추가할 때 반드시 함께 적용한다.
내전은 화면에서 members를 직접 조회하지 않고 서버가 `isApprovedMember()`로 강제한다(아래 참조).

**추방(완전 삭제):** FK의 `ON DELETE` 설정에 의존하지 않고
`app/api/admin/members/[id]/route.ts`의 `CHILD_TABLES`(`riot_accounts` 포함)를 명시적으로 정리한 뒤 members를 삭제한다.
`hall_of_fame`만 예외로 삭제하지 않고 `member_id=null` + 이름 스냅샷을 남긴다.

**RLS 주의:** `members`에는 self-UPDATE 정책을 두지 않는다. RLS는 행 단위라 컬럼을 제한할 수 없어,
정책이 있으면 사용자가 콘솔에서 자기 `status`를 `approved`로 바꿀 수 있다.
정당한 self-UPDATE(프로필 이미지/프레임, Riot ID 신청)는 전부 서버 라우트에서 service role로 수행한다.

## 내전 (custom games)

### `game_kind` vs `game_type` — 절대 합치지 말 것

| 컬럼 | 값 | 의미 |
|---|---|---|
| `game_kind` | `'tft' \| 'lol' \| 'steam' \| 'etc'` | **어떤 게임**인가. 신규 컬럼 |
| `game_kind_label` | text ≤30자 | `game_kind='etc'`일 때만 값 존재. CHECK로 상호 강제 |
| `game_type` | `'solo' \| 'team'` | TFT **경기 방식**(개인전/2인 팀전). `game_kind='tft'`일 때만 의미 |

`game_type`은 팀 배정·라운드 결과 코드가 이미 점유한 컬럼이다. 여기에 게임 종류를 넣으면
`teams/route.ts`·`rounds/route.ts`가 깨진다.

**비-TFT 차단:** 라운드·팀·게스트는 전부 Riot TFT 매치 조회를 전제하므로
`game_kind !== 'tft'`면 rounds/teams/guests API가 `rejectNonTftGame()`으로 **400**을 반환한다.
UI에서 섹션을 숨기는 것은 UX일 뿐 통제 수단이 아니다.

### 권한 규칙

```
생성   POST /api/custom-games            로그인 + members.status='approved' (관리자 여부 무관)
참가   POST|DELETE /[id]/join            로그인 + approved. 주최자는 취소 불가(삭제로 유도)
관리   PATCH|DELETE /[id], /[id]/end,
      /[id]/rounds|teams|guests,
      /[id]/participants/[pid]           canManageGame() = 관리자 OR 주최자 본인
```

`lib/customGames/authorize.ts`
- `getViewerMember()` — 세션 `user_id`(→ `discord_id` fallback)로만 멤버를 해석한다.
  **요청 body의 어떤 member 식별자도 신뢰하지 않는다.**
- `canManageGame(game, viewerMemberId, isAdmin)` — `host_member_id`는 추방 시 null이 될 수 있으므로
  `null === null`로 통과하지 않도록 양쪽 null을 명시적으로 거부한다.
- `authorizeGameManage(gameId)` — 401/404/503/403 판정 후 `{ viewer, game }` 반환.

### 대기열은 저장하지 않고 순번에서 파생한다 ★

`custom_game_participants`에 `status('confirmed'|'waitlisted')` 컬럼을 **만들지 않는다.**
저장하면 취소마다 승격 UPDATE가 필요해지고, 동시 취소 2건이 같은 대기자를 중복 승격하거나
아무도 승격하지 못하는 경합이 생긴다. 앱 코드로는 막을 수 없다.

**채택: `(joined_at, id)` 정렬 상위 `capacity`명이 확정, 나머지가 대기** (`lib/customGames/waitlist.ts`).
- 취소 = DELETE 1건. 승격 로직이 존재하지 않으므로 승격 경합도 존재하지 않는다
- 정원 상/하향, 동시 취소, 취소+신청 동시 발생이 모두 자동으로 올바르다
- 게스트도 같은 정원을 소비한다 (`effectiveMemberCapacity(capacity, guestCount)`)

**DB 제약이 유일한 방어선인 곳:** `unique (custom_game_id, member_id)`.
앱의 select→insert는 더블클릭·동시요청에 반드시 뚫린다. 23505 → **409** 매핑.

**RLS:** `custom_games` / `custom_game_participants` 모두 **select 정책만** 둔다.
self-INSERT/DELETE 정책을 만들면 사용자가 콘솔에서 `joined_at`을 조작해 대기열을 새치기할 수 있다.

### API 목록

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/custom-games` | 목록 + `confirmed_count`/`waitlist_count`/`guest_count`/`host_member_name`/`can_manage`/`my_participation` |
| POST | `/api/custom-games` | 모집 생성. 주최자가 자동으로 첫 참가자 |
| GET | `/api/custom-games/[id]` | 상세 + `confirmed[]`/`waitlist[]`/`can_manage`/`my_participation` |
| PATCH | `/api/custom-games/[id]` | 수정 (화이트리스트 — `host_member_id`/`status`/`id`는 절대 안 바뀜) |
| DELETE | `/api/custom-games/[id]` | 삭제 |
| POST\|DELETE | `/api/custom-games/[id]/join` | 참가 신청 / 취소 |
| DELETE | `/api/custom-games/[id]/participants/[participantId]` | 강퇴 |
| POST | `/api/custom-games/[id]/end` | 종료 |
| POST | `/api/custom-games/[id]/rounds\|teams\|guests` | TFT 전용 |

**생성/수정 요청 형식:**
`{ title, scheduled_date: "YYYY-MM-DD", scheduled_time: "HH:mm", capacity, game_kind, game_kind_label?, game_type?, max_rounds? }`

### 타임존 — 클라이언트에서 절대 `new Date()`로 변환하지 않는다

`<input type="date">`/`<input type="time">` 값을 문자열 그대로 보내고,
서버의 `parseScheduledAt()`이 `new Date(\`${date}T${time}:00+09:00\`)`로 변환한다
(한국은 서머타임이 없어 고정 오프셋이 안전하다).
클라이언트에서 ISO로 변환하면 브라우저 로컬 타임존으로 해석되어 실제 일정과 어긋난다.
표시는 전부 `lib/customGames/display.ts`의 헬퍼(=`Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul' })`)로 고정한다.

> `lib/customGames/display.ts`는 클라이언트 컴포넌트도 import한다.
> server-only 모듈(`lib/customGames/game.ts`)을 여기서 import하면 안 된다.

### 남용 방지

| 벡터 | 대응 |
|---|---|
| 무한 모집글 | 동일 host의 `recruiting`+`in_progress` 동시 3개 제한 |
| 과거/먼 미래 날짜 | `now()-10분` ~ `now()+90일` |
| 정원 남용 | `capacity` 2~100. `tft`+`team`이면 8 고정 |
| 참가 스팸 | 유니크 인덱스 + 총 신청 상한 `min(capacity*3, 60)` |
| 문자열 | `title ≤60자`, `game_kind_label ≤30자` |

### 마이그레이션 미적용 시 degrade

`scripts/sql/20260725_custom_game_recruit.sql` 미실행 상태에서 신규 컬럼 부재는 Postgres `42703`으로
나타난다. `isMissingColumnError()`가 이를 잡아 **500이 아니라** 목록 GET은 구 컬럼 fallback +
`migration_required: true`, 나머지는 503 안내로 degrade한다. UI도 이 플래그로 배너를 띄운다.

## 관리자 기능

- `/admin/members/control` — 멤버 CRUD + 승인/거절/추방, 로그인 연결 현황 (Riot ID 수정 시 자동 재동기화)
- `/admin/members/sync` — 개별/전체 동기화, 동기화 현황 테이블
- `/admin/seasons` — 시즌 생성·활성화·종료, 명예의 전당 마감
- `/admin/profile-frames` — 프레임 이미지 업로드·삭제

관리자 여부는 `admins` 테이블에서 확인 (`/api/admin/me` 엔드포인트).
`user_id` 미연결 시 Discord identity id(`discord_id`)로 매칭 후 `user_id`를 자동 백필한다.
관리자 페이지는 별도 auth 체크 없이 API에서 `requireAdmin()` (`app/lib/isAdmin.ts`)으로 처리.

## 티어 순서 (정렬 기준)

```
CHALLENGER(1) > GRANDMASTER(2) > MASTER(3) > DIAMOND(4) >
EMERALD(5) > PLATINUM(6) > GOLD(7) > SILVER(8) > BRONZE(9) > IRON(10)
```

랭크 순서: `I(1) < II(2) < III(3) < IV(4)` (숫자 낮을수록 높은 랭크)
동점 시 LP 내림차순.

## 명예의 전당 공동 순위

`hall-of-fame/page.tsx`에서 `reduce`로 계산 (1-2-2-4 방식):
같은 티어·랭크·LP면 이전 순위 유지, 다르면 `index + 1`로 갱신.

## 기물 이미지 URL (CommunityDragon)

`lib/tft/tftLocale.ts`의 `getUnitImageUrl(characterId)`가 생성하는 URL 패턴:
```
https://raw.communitydragon.org/latest/game/assets/characters/{lower}/hud/{lower}_square.tft_set{N}.png
```

일부 챔피언은 `{characterId}_square` 가 아닌 다른 파일명 사용. 이 경우 `IMAGE_FILENAME_OVERRIDES` 맵에 추가:
```ts
const IMAGE_FILENAME_OVERRIDES: Record<string, string> = {
  tft17_rhaast: 'tft17_kayn_slay_square',  // Rhaast = Kayn 변신 형태
}
```
새 시즌 챔피언 이미지 404 발생 시 CommunityDragon `files.exported.txt`에서 실제 파일명 확인 후 맵에 추가.

## 주의 사항

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하므로 서버 사이드에서만 사용
- 크론 엔드포인트(`GET /api/admin/sync-all`, `GET /api/admin/sync-steam`)는 `Authorization: Bearer CRON_SECRET`(또는 `ADMIN_SYNC_TOKEN`) 헤더 필수
  (두 경로 모두 `middleware.ts`의 `BYPASS_PATHS`에 등록되어 있어야 한다)
- **`STEAM_API_KEY`는 서버 전용.** Steam Web API는 헤더 인증을 지원하지 않아 키를 쿼리 파라미터로 보내므로,
  `lib/steam/*`는 전부 `import 'server-only'`이고 에러 메시지·로그에 URL을 절대 싣지 않는다.
- 스팀 계정은 **소유권을 증명하지 않는다**(사용자 입력). `members_steam_id64_uidx` 유니크로 선점만 막고 중복 시 409.
- 스팀 멀티플레이 판정은 `store.steampowered.com/api/appdetails`(**비공식**) 기반이라
  실패해도 전체 동기화를 깨뜨리지 않고 `is_multiplayer=null`("분류 미확인")로 남긴다.
- 수동 동기화(`POST /api/admin/sync-all`)는 Supabase 세션 기반 `requireAdmin()` 체크
- Riot API 키는 반드시 `X-Riot-Token` 헤더로 전송 — URL 쿼리 파라미터 사용 금지
- 멤버 동기화는 기본 쿨다운 300초 (프론트: `NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC`, 백: `doSyncMember.ts` 내 10분)
- 프로필 이미지: Supabase Storage `profile-images` 버킷
- 프레임 이미지: Supabase Storage `profile-frames` 버킷
- `/api/members/[id]/sync`는 로그인 + (본인 소유 멤버 또는 관리자)만 호출 가능 — 무인증 호출은 Riot 레이트리밋 고갈 벡터
- DB 마이그레이션은 `scripts/sql/`에 파일로만 작성하고 Supabase SQL Editor에서 직접 실행한다.
  **SQL 먼저 → 배포 나중** 순서를 지킬 것 (`members.status`, `hall_of_fame.member_name_snapshot`을 코드가 참조함)

## 하네스: lolche-dev

**목표:** 코드 변경 작업을 Analyst → Developer → QA 파이프라인으로 안전하게 처리

**트리거:** 기능 추가·버그 수정·리팩토링·보안 개선 등 코드 변경 요청 시 `lolche-dev` 스킬을 사용하라. 단순 코드 설명이나 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-09 | 초기 구성 | 전체 | Analyst→Developer→QA 파이프라인 구성 |
