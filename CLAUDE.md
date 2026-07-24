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
    ui/PageHeader.tsx           # kicker + h1 + 설명. **순수 서버 컴포넌트**('use client' 금지 — /steam ISR)
    ui/SectionHeader.tsx        # h2 + 힌트
    ui/EmptyState.tsx           # 빈 상태 카드
    ranking/HallOfFameCard.tsx
  admin/                        # 관리자 전용 (인증 필요)
    layout.tsx                  # 관리자 사이드바 레이아웃
    members/
      control/page.tsx          # 멤버 등록·수정·삭제
      sync/page.tsx             # 멤버 동기화 현황
    seasons/page.tsx            # 시즌 관리
    profile-frames/             # 프로필 프레임 관리
  steam/                        # 스팀 (나와 같은 게임·함께 할 수 있는 게임·최근 2주 플레이)
    page.tsx                    # Server Component, revalidate 300s. **DB만 조회 — Steam API 호출 0건**
                                # ⚠ 세션 접근 금지 (아래 "ISR × 개인화 분리" 참조)
    SteamLinkForm.tsx           # 스팀 ID 등록/해제 폼 (Client Component)
    SharedWithMe.tsx            # "나와 같은 게임을 가진 사람들" (Client Component, 개인화)
    SteamPresence.tsx           # "지금 스팀 접속 중" (Client Component, 60초 폴링 · 실시간)
  custom-games/                 # 내전 (목록·모집 폼 / [id] 상세)
    _components/SteamGamePicker.tsx  # 스팀 게임 선택(보유 게임 목록) + 직접 입력 폴백 (Client)
  hall-of-fame/                 # 명예의 전당 (시즌 기록, 진입 즉시 표시 — 인트로 없음)
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
    steam/                      # ⚠ 전부 force-dynamic + **DB만 조회**. `lib/steam/*` import 금지
      game-options/route.ts     #   내전 스팀 게임 후보 (steam_game_options RPC, 로그인+approved)
      shared-with-me/route.ts   #   "나와 같은 게임을 가진 사람들" 요약 (steam_shared_with_member RPC)
      shared-with-me/[memberId]/route.ts  # 상대 1명과 겹치는 전체 게임 (지연 로딩)
    steam-catalog/              # ⚠ **외부 호출 전용 경계.** `app/api/steam/` 와 의도적으로 분리한 경로다.
      search/route.ts           #   스팀 스토어 전체 카탈로그 검색 (비공식 storesearch, 서버 인메모리 캐시)
    steam-presence/route.ts     # ⚠ **외부 호출 전용 경계.** GetPlayerSummaries 로 "지금 접속 중" 조회
                                #   force-dynamic + 로그인·approved 게이트 + 인메모리 TTL 캐시. DB 저장 없음
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
  db/
    pgErrors.ts                 # 42703·PGRST204/23505/23514/PGRST202·42883 판별 (마이그레이션 degrade 단일 지점)
                                # ★ 컬럼 부재는 코드가 2개다: SELECT=42703(Postgres), INSERT/UPDATE payload=PGRST204(PostgREST 스키마 캐시)
  supabase.ts                   # anon 클라이언트 + 브라우저 클라이언트
  supabaseAdmin.ts              # service role 클라이언트 (서버 전용)
  supabase/
    service.ts                  # supabaseService (service role, 서버 전용)
    browser.ts                  # createClient factory (브라우저)
  riot/
    api.ts                      # Riot API 클라이언트 (X-Riot-Token 헤더 인증)
  steam/                        # ⚠ 전부 `import 'server-only'` — STEAM_API_KEY 클라이언트 노출 금지
    api.ts                      # Steam Web API (GetPlayerSummaries / GetOwnedGames / ResolveVanityURL)
    presence.ts                 # "지금 접속 중" 조회 + 모듈 스코프 TTL 캐시 (STEAM_PRESENCE_TTL_MS)
    resolveSteamId.ts           # 입력 4형태 → SteamID64 정규화
    appDetails.ts               # store appdetails(비공식)로 멀티플레이 판정
    storeSearch.ts              # store storesearch(비공식)로 전체 카탈로그 검색. 키 불필요, 타임아웃·캐시 내장
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
    steamViewer.ts              # 개인화 스팀 섹션의 요청자 상태 해석 (approved/스팀등록/공개 여부)
  tft/
    tftLocale.ts                # 기물 이미지 URL 생성, 한국어 이름 변환 (KrMaps 캐시)
  ui/
    styles.ts                   # 공통 className 상수(SHELL/CONTAINER/CARD/INPUT/BTN_*/ALERT/H1…).
                                # 순수 문자열이라 서버·클라 양쪽에서 import 한다. 'server-only' 금지

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
RIOT_API_KEY=                       # RGAPI-... TFT 전용 앱 키
RIOT_LOL_API_KEY=                   # RGAPI-... LoL 전용 앱 키 (TFT 키와 다른 앱). 서버 전용
RIOT_ACCOUNT_BASE_URL=              # https://asia.api.riotgames.com/...
RIOT_TFT_LEAGUE_BASE_URL=           # https://kr.api.riotgames.com/...
RIOT_TFT_MATCH_BASE_URL=            # https://asia.api.riotgames.com/...
RIOT_LOL_LEAGUE_BASE_URL=           # https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid
NEXT_PUBLIC_LOL_ENABLED=true        # LoL 기능 전체 on/off (빌드타임 인라인 → 변경 시 재배포)
STEAM_API_KEY=                      # ⚠ 서버 전용. NEXT_PUBLIC_ 접두사 절대 금지
STEAM_SYNC_BATCH=50                 # 1회 스팀 동기화 멤버 수
STEAM_MEMBER_DELAY_MS=400           # 멤버 간 호출 간격(ms)
STEAM_APP_DETAIL_BATCH=40           # 1회 실행에서 멀티플레이 판정할 신규 앱 수
STEAM_APP_DETAIL_DELAY_MS=1500      # 비공식 store API 호출 간격(ms)
STEAM_STORE_TIMEOUT_MS=4000         # 비공식 store API 타임아웃 (초과 시 빈 결과 degrade)
STEAM_CATALOG_CACHE_TTL_MS=600000   # 카탈로그 검색 결과 인메모리 캐시 TTL (10분)
STEAM_PRESENCE_TTL_MS=60000         # "지금 접속 중" 인메모리 캐시 TTL (1분). 뷰어 수와 무관하게 호출 1회/TTL
ADMIN_SYNC_TOKEN=                   # 크론 트리거용 시크릿 (CRON_SECRET 없을 때 fallback)
CRON_SECRET=                        # Vercel Cron 전용 시크릿 (설정 시 ADMIN_SYNC_TOKEN보다 우선)
RIOT_MATCH_DETAIL_DELAY_MS=1200     # 매치 API 호출 간격(ms)
RIOT_MEMBER_DELAY_MS=800            # 멤버 간 · 라이엇 계정 간 호출 간격(ms)
SYNC_ALL_BATCH=10                   # 1회 전체 동기화 멤버 수 (계정 최대 3개 감안해 20→10)
NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC=300  # 프론트 쿨다운 표시용
```

### LoL 기능 플래그 — `NEXT_PUBLIC_LOL_ENABLED`

Riot 앱은 제품 단위로 분리된다. TFT 키와 LoL 키는 **서로 다른 앱**이며 각각
`RIOT_API_KEY` / `RIOT_LOL_API_KEY`에 넣는다. 플래그는 `lib/constants/features.ts` → `LOL_ENABLED`.

**⚠ PUUID는 API 키에 종속된 암호문이다.** 같은 계정이라도 TFT 키로 받은 puuid와 LoL 키로 받은 puuid는
**값이 다르며**, 교차 사용하면 `400 Exception decrypting`이 반환된다. 따라서:

- `riot_accounts.riot_puuid` = TFT 키 기준 (TFT 리그·매치·**내전 기록 매칭**에 사용). LoL puuid로 절대 덮지 않는다
- `riot_accounts.lol_puuid` = LoL 키 기준 (LoL 리그 조회 전용, `20260729_lol_puuid.sql`)
- `lol_puuid`는 null일 때만 발급하는 lazy 캐시이며, 400이 나면 **1회** 자동 재발급한다(키 교체 시 자동 복구)
- `members`에는 `lol_puuid`를 두지 않는다 — 공개 랭킹은 이 값을 읽지 않고, 대표 계정 전환 시 stale 위험만 생긴다
- `lib/members/primaryAccount.ts`의 `CLEARED_RANK_COLUMNS`에 `lol_puuid: null`이 반드시 있어야 한다.
  빠지면 Riot ID를 바꿔도 옛 lol_puuid가 남아 **남의 LoL 랭크가 내 랭킹에 표시**된다

`riotFetch(url, product)`가 `'tft' | 'lol'`로 키를 선택한다. `RIOT_LOL_API_KEY`가 비어 있으면
LoL 단계 전체를 건너뛰고 `null`을 반환해 기존 저장값을 덮어쓰지 않는다(403 degrade와 동일 철학).
경고는 `warnOnce`로 1회만 남긴다.

| 위치 | false일 때 동작 |
|---|---|
| `app/components/SiteNav.tsx` | "롤" 항목 미렌더 |
| `app/page.tsx` 대시보드 | 롤 카드 미렌더 |
| `app/lol/page.tsx` | `notFound()` → **404** (URL 직접 접근 차단) |
| `lib/sync/doSyncMember.ts` | LoL 조회 단계 자체를 건너뜀 (불필요한 호출 방지) |

`NEXT_PUBLIC_LOL_ENABLED=true` + **Vercel에 `RIOT_LOL_API_KEY` 등록** + 재배포로 활성화된다.
**최초 동기화 전까지 `/lol`은 빈 상태(EmptyState)가 정상이다** — 에러도 404도 아니다.
`fetchLolLeaguesByPuuid()`는 403을 재시도하지 않고 `console.warn` 1회 후 `null`을 반환해
기존 저장값을 덮어쓰지 않고 degrade한다. `riot_accounts` 미적용(레거시 단일 계정) 경로에서는
`lol_puuid`를 캐시할 곳이 없어 LoL 단계를 건너뛴다.

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
              → fetchPuuid()            Riot Account API (TFT 키)
              → fetchTftLeaguesByPuuid() Riot TFT League API
              → [LOL_ENABLED] fetchLolPuuid()   Riot Account API (LoL 키) — lol_puuid null일 때만
              → [LOL_ENABLED] fetchLolLeaguesByPuuid()  Riot LoL League API (LoL 키 + lol_puuid)
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
| `custom_games` | 내전 모집글 (`host_member_id`, `game_kind`, `game_kind_label`, `steam_app_id`, `capacity`, `scheduled_at`, `status`) |
| `custom_game_participants` | 참가 신청. **확정/대기 컬럼 없음** — `(joined_at, id)` 순번에서 파생 |
| `custom_game_guests` | 내전 게스트 (`riot_puuid` 보유 → TFT 전용 개념) |
| `custom_game_rounds` / `_results` / `_guest_results` / `_teams` | TFT 내전 라운드·결과·팀 배정 |
| `steam_apps` | 스팀 앱 메타 + `is_multiplayer` 3-값 캐시 (true/false/null=분류 미확인). 앱당 1회 조회 후 영구 보관 |
| `steam_owned_games` | 멤버별 보유 게임 + `playtime_forever`/`playtime_2weeks`(분). `/steam`이 읽는 유일한 소스 |

`members.discord_avatar_url` (20260729_discord_avatar.sql): Discord OAuth 세션의
`user_metadata.avatar_url` 원문. 로그인마다 `app/auth/callback/route.ts`가 갱신한다.

**스팀 RPC (전부 `security definer` + `revoke ... from public, anon, authenticated` — 서버 라우트 전용):**

| 함수 | 파일 | 용도 |
|---|---|---|
| `steam_game_options(q, mp_only, limit)` | `20260727_custom_game_steam.sql` | 내전 스팀 게임 후보 (보유자 수 desc) |
| `steam_shared_with_member(member_id, mp_only)` | `20260728_steam_shared_games.sql` | 나와 겹치는 사람 요약 + 미리보기 3개 |
| `steam_shared_games_detail(member_id, other_id, mp_only, limit)` | 〃 | 상대 1명과 겹치는 전체 게임 |

세 함수 모두 `where m.status='approved' and m.steam_id64 is not null`을 내장하고,
`mp_only=true`는 `is_multiplayer = false`만 제외한다(`null`=분류 미확인은 남긴다).
`authenticated`에 실행권을 남기면 브라우저에서 임의의 `p_member_id`로 남의 목록을 조회할 수 있다.

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
`scripts/sql/20260729_lol_puuid.sql` — `riot_accounts.lol_puuid` (LoL 키 전용 PUUID). 인덱스 0개, 백필 불가.

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

## 스팀 페이지 (`/steam`)

**섹션 구성:** 헤더 → `SteamLinkForm` → **지금 스팀 접속 중**(실시간) →
**나와 같은 게임을 가진 사람들**(개인화) →
함께 할 수 있는 게임(2명 이상 보유) → 최근 2주 플레이 → 비공개 멤버 안내 → 마지막 동기화 시각.

### "지금 스팀 접속 중" (`SteamPresence.tsx` → `/api/steam-presence`)

presence 는 **실시간이자 세션 인증이 필요**하므로 `revalidate=300` 페이지에 서버 렌더로 넣을 수 없다.
`SharedWithMe` 와 동일하게 Client → `force-dynamic` API 로만 흐른다.

- **DB 저장 금지.** presence 는 휘발성이라 컬럼을 만들면 크론이 하루 지난 "온라인"을 박제한다 → 마이그레이션 불필요
- 캐시는 `lib/steam/presence.ts` 의 모듈 스코프 단일 엔트리(`STEAM_PRESENCE_TTL_MS`, 기본 60초).
  뷰어가 몇 명이든 Steam 호출은 TTL 당 1회. 동시 요청은 in-flight 프라미스를 공유한다
- 클라이언트는 `document.visibilityState === 'visible'` 일 때만 60초 폴링 (`visibilitychange` 연동)
- 미로그인(401)·미승인(403)이면 섹션 자체를 **렌더하지 않는다**

**⚠ 오정보 방지 — 3-상태로 나눈다.** `personastate` 는 프로필이 비공개면 실제 상태와 무관하게 **항상 0** 이다.
이를 "오프라인"으로 단정하면 거짓이다.

| 조건 | state | 표시 |
|---|---|---|
| `communityvisibilitystate ≠ 3` (또는 DB `steam_visibility ≠ 3`) | `unavailable` | "표시 불가 — 프로필 비공개" |
| `personastate` 1~6 | `online` | 온라인 점 + `gameextrainfo` 게임명 배지 우선 |
| `personastate` 0 | `offline` | 미표시 |

`personastate`: 0=오프라인 1=온라인 2=바쁨 3=자리비움 4=취침 5=거래희망 6=플레이희망.
`gameextrainfo` 는 "게임 상세정보 공개"일 때만 내려온다 — 없다고 게임 중이 아닌 것은 아니다.

> "보유 게임 수 랭킹" / "총 플레이타임 랭킹"은 **제거되었다.** `RankList` 컴포넌트와
> `MemberStat`의 `gameCount`/`totalMinutes`도 함께 삭제됐다.
> `formatHours()`는 "최근 2주 플레이"가 계속 쓰므로 **삭제하지 않는다.**

### ★ ISR × 개인화 분리 (위반 금지)

`app/steam/page.tsx`는 `revalidate = 300`이고 이는 **경로 단위 공유 캐시**다.
여기서 세션을 읽어 개인화하면 **A가 처음 만든 HTML이 B에게 서빙된다** — 사용자 간 데이터 유출이다.

- `app/steam/page.tsx`에서 `cookies()` / `createRouteClient()` / `auth.getUser()`를 **절대 호출하지 않는다**
- 개인화는 오직 `SharedWithMe.tsx`(Client) → `/api/steam/shared-with-me*`(`force-dynamic`) 경로로만 흐른다
- 페이지 전체를 `force-dynamic`으로 바꾸지 않는다. 공통 섹션(함께 할 수 있는 게임 / 최근 2주)은
  전원 동일한 데이터라 캐시가 정당하고, 매 요청마다 최대 20페이지 × 1000행을 재조회하게 된다
- 개인화 섹션이 실패해도 나머지 섹션은 정상 동작해야 한다 (Client Component라 구조적으로 격리됨)

### 개인화 섹션 상태별 표시 (`lib/members/steamViewer.ts`)

| 뷰어 상태 | API | 표시 |
|---|---|---|
| 미로그인 | 401 | 로그인 안내 (`/login`) |
| 멤버 행 없음 | 200 `state='no_member'` | 멤버 등록 안내 (`/profile`) |
| `status ≠ approved` | **403** | 승인 후 이용 안내 |
| 스팀 미등록 | 200 `state='no_steam'` | 스팀 ID 등록 안내 |
| `steam_visibility ≠ 3` | 200 `state='private'` | 비공개라 불러올 수 없다고 **이유를 명시** |
| RPC 미적용 | 200 `migration_required` | "기능 준비 중" |

상세 라우트(`/[memberId]`)의 path param은 **상대방 id 뿐**이다. 내 `member_id`는 항상 세션에서 유도하므로
제3자가 남의 조합(A↔B)을 조회할 수 없다.

## 내전 (custom games)

### `game_kind` vs `game_type` — 절대 합치지 말 것

| 컬럼 | 값 | 의미 |
|---|---|---|
| `game_kind` | `'tft' \| 'lol' \| 'steam' \| 'etc'` | **어떤 게임**인가. 신규 컬럼 |
| `game_kind_label` | text ≤30자 | `'etc'`=**필수**, `'steam'`=**선택**(게임 미정 모집 허용), 그 외=반드시 null. CHECK로 상호 강제 |
| `steam_app_id` | int | `game_kind='steam'` 전용. 캡슐 이미지 표시용 스냅샷. **`steam_apps(appid)`로 FK를 걸지 않는다**(백필 전 앱 때문에 내전 생성이 실패하면 안 된다). 이름은 `game_kind_label`에 별도 스냅샷 |
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
| GET | `/api/steam/game-options?q=&multiplayer_only=` | 스팀 게임 후보 (로그인 + approved, DB만 조회) |

**생성/수정 요청 형식:**
`{ title, scheduled_date: "YYYY-MM-DD", scheduled_time: "HH:mm", capacity, game_kind, game_kind_label?, steam_app_id?, game_type?, max_rounds? }`

### 스팀 내전 게임 선택

`game_kind='steam'`이면 `steam_owned_games ⋈ steam_apps` 기반 후보 목록에서 고르거나
**직접 타이핑**할 수 있다(폴백은 항상 제공). **Steam Web API 호출 0건 — DB만 읽는다.**

| 경로 | `game_kind_label` | `steam_app_id` |
|---|---|---|
| 목록에서 선택 | 앱 이름 스냅샷 | `appid` |
| 직접 입력 | 입력한 이름 | `null` |
| 게임 미정 | `null` | `null` |

게임 검색 소스는 **2개**다.

| 소스 | API | 표시 | 기본 |
|---|---|---|---|
| 멤버 보유 게임 | `GET /api/steam/game-options` (DB, RPC) | `보유 N명` 배지 | **ON** |
| 스팀 전체 카탈로그 | `GET /api/steam-catalog/search` (외부 storesearch) | `스팀 스토어` 배지, 보유자 수 없음 | 세그먼트 토글 / 보유 결과 0건 시 유도 |

카탈로그에서 고른 앱은 `steam_apps` 에 행이 없을 수 있다.
`custom_games.steam_app_id` 에 FK 가 없으므로(20260727 STEP 1) 그대로 저장된다.
**고른 앱을 `steam_apps` 에 upsert 하지 않는다** — `backfillAppDetails()` 대상만 늘리고 얻는 게 없다.

이름을 함께 스냅샷으로 저장하므로 렌더에 `steam_apps` 조인이 필요 없다.
`steam_app_id`의 유일한 용도는 캡슐 이미지(`steamCapsuleUrl()` in `lib/customGames/display.ts`)다.
`game_kind`를 steam 이외로 바꾸면 `parseGameKind()`가 라벨·appid를 null로 만들고,
DB CHECK(`custom_games_steam_app_id_chk`)가 23514로 최종 차단한다.

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

**★ `GAME_COLUMNS`에 컬럼을 추가할 때는 반드시 fallback을 함께 넣는다.**
컬럼 하나만 추가해도 미적용 환경의 목록·상세 GET이 **전부 42703으로 죽는다.**
`lib/customGames/game.ts`는 3단계로 내려간다:
`GAME_COLUMNS` → `LEGACY_GAME_COLUMNS`(20260727 미적용) → `PRE_RECRUIT_GAME_COLUMNS`(20260725 미적용).
`fetchGame()`도 같은 fallback을 쓰고 `steam_app_id`를 `null`로 채운 뒤 `migrationRequired`를 함께 돌려준다.

스팀 관련 쓰기(라벨/appid)는 CHECK 완화(20260727)가 선행되어야 하므로
`isCheckViolation()`(23514) / `isMissingColumnError()`(42703)를 잡아 **503 안내**로 돌린다(500 금지).
RPC 부재(`PGRST202`/`42883`)는 `isMissingFunctionError()`가 잡아 **200 + `migration_required: true` + 빈 목록**이다.
판별 함수는 전부 `lib/db/pgErrors.ts` 한 곳에 있다.

## 프로필 아바타 우선순위

표시 URL은 **`lib/members/avatar.ts`의 `resolveAvatarUrl(member)` 단 하나**로만 만든다.
화면마다 스토리지 URL을 직접 조립하지 않는다.

```
discord_avatar_url (Discord CDN) → null(이니셜/기본 이미지)
```

- **프로필 사진은 Discord 전용이다.** 직접 업로드 기능(`app/api/profile/image`, `ProfileEditor`의 업로드 UI)은
  제거됐다. 표시 아바타는 Discord OAuth 로그인 때 자동으로 채워지는 `discord_avatar_url` 하나뿐이다.
  `/profile`은 "프로필 사진은 Discord 프로필을 사용합니다" 안내만 보여준다(프레임 설정은 유지).
- **`members.profile_image_path` 컬럼은 DROP하지 않는다.** 파괴적이고, hall_of_fame 스냅샷에 과거 값이 남아 있다.
  코드에서 표시 참조만 끊었고(`resolveAvatarUrl`이 더 이상 읽지 않음), 스냅샷 백필은 계속 이 컬럼을 읽는다.
- 스팀 화면(`/steam`, 온라인 상태, 같은 게임)만 예외로 `steam_avatar_url`을 먼저 쓰고
  없을 때 `resolveAvatarUrl()`로 내려간다 (맥락이 스팀이므로).
- `hall_of_fame`은 추방된 멤버를 위해 `profile_image_snapshot`을 **마지막 폴백으로 유지**한다
  (`Podium.tsx`의 `rankerImageUrl()`이 `profileImageUrl()`로 렌더). 추방된 멤버는 Discord 연결이
  없을 수 있어 과거 스냅샷이 유일한 이미지원이다.

**신뢰 경계:** `user_metadata`는 IdP가 채우는 값이다. `isDiscordAvatarUrl()`이
https + `cdn.discordapp.com`만 통과시킨다. 저장(`getDiscordAvatarUrl`)과 표시(`resolveAvatarUrl`)
양쪽에서 검증한다 — 검증 없이 next/image에 넘기면 임의 외부 URL이 렌더된다.
`next.config.ts`의 `remotePatterns`도 `cdn.discordapp.com` + `/avatars/**`로 좁혀 두었다.

**마이그레이션 미적용 degrade:** `discord_avatar_url` 컬럼이 없으면 select가 42703으로 실패한다.
`withAvatarColumn()`이 이를 잡아 컬럼 없이 1회 재조회하므로 500 대신 아바타 없이(이니셜/기본 이미지)
보이는 상태로 degrade한다. members를 조회하는 화면을 추가할 때 이 헬퍼를 함께 쓴다.

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
  (두 경로 모두 `proxy.ts`의 `BYPASS_PATHS`에 등록되어 있어야 한다.
  Next 16에서 `middleware.ts` 규약이 `proxy.ts`로 이름이 바뀌었고 export 함수명도 `proxy`다)
- **스팀 API 경로 규칙 (2계층):**
  - `app/api/steam/**` = **DB 전용 경계.** force-dynamic + Supabase RPC/테이블만. `lib/steam/*` import 금지.
    이 디렉토리에 외부 호출을 넣지 않는다 — 넣고 싶으면 아래 경로를 쓴다.
  - `app/api/steam-catalog/**`, `app/api/steam-presence/**` = **외부 호출 경계.** `lib/steam/*` import 허용.
    반드시 (1) 로그인 + approved 게이트 (2) 검색어 최소 길이 (3) 서버측 캐시 (4) 타임아웃
    (5) 실패 시 200 + 빈 결과 degrade 를 모두 갖춘다.
  - 두 경계를 한 라우트에 섞지 않는다. 섞는 순간 "이 파일이 외부를 부르는가"를 경로로 판별할 수 없게 된다.
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
| 2026-07-23 | 스팀 3건 | `/steam`, 내전, 명예의 전당 | 개인화 섹션 추가(ISR 분리), 내전 스팀 게임 선택, 인트로 제거 |
| 2026-07-23 | 디자인 통일 | 전 페이지, `SiteNav` | 디자인 토큰(`lib/ui/styles.ts` + `@theme`) 도입, 폰트 복원, 홈 아이콘 |
| 2026-07-23 | 카탈로그 검색 | `SteamGamePicker`, `app/api/steam-catalog/` | 내전 스팀 게임을 보유 목록 밖에서도 고를 수 있게 |
| 2026-07-23 | 지금 접속 중 | `SteamPresence`, `lib/steam/presence.ts`, `app/api/steam-presence/` | 스팀 실시간 상태. ISR 페이지 불변 + 외부 호출 경계 분리 |
