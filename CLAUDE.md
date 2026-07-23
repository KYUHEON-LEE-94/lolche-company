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
  hall-of-fame/                 # 명예의 전당 (시즌 기록)
  login/                        # 사용자 로그인 (Discord OAuth 버튼)
  auth/callback/route.ts        # OAuth 코드 교환 + discord_id ↔ user_id 연결
  profile/                      # 프로필 이미지·프레임 편집 + 라이엇 ID 자가 등록
    MemberSelfForm.tsx          # 라이엇 ID 등록/수정 폼 (항상 pending으로 신청)
  api/                          # API 라우트
    me/member/route.ts          # 내 멤버 조회(GET) / 자가 등록·수정(POST, 세션 소유권 기반)
    members/[id]/
      sync/route.ts             # 개별 멤버 동기화 (쿨다운 + 관리자/본인 인증)
      matches/route.ts          # 최근 매치 조회 (tft_matches !inner 조인, 단일 쿼리)
      history/route.ts          # 랭크 히스토리 조회
    admin/
      sync-all/route.ts         # 전체 멤버 동기화 (GET=크론, POST=수동)
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
  sync/
    syncMember.ts               # 재시도 + 지수 백오프 래퍼
    doSyncMember.ts             # Riot API 실제 호출 + DB 업데이트
    writeSyncLog.ts             # sync_logs 테이블 감사 로그
  actions/
    season-actions.ts           # 시즌 Server Actions
  members/
    memberInput.ts              # 멤버 입력 화이트리스트 파서 + 길이/포맷 검증 상수
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
ADMIN_SYNC_TOKEN=                   # 크론 트리거용 시크릿 (CRON_SECRET 없을 때 fallback)
CRON_SECRET=                        # Vercel Cron 전용 시크릿 (설정 시 ADMIN_SYNC_TOKEN보다 우선)
RIOT_MATCH_DETAIL_DELAY_MS=1200     # 매치 API 호출 간격(ms)
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
| `members` | 멤버 정보 + TFT 랭크 + 동기화 상태 (`discord_id`/`user_id`로 로그인 계정 연결, `status`로 승인 워크플로) |
| `admins` | 관리자 계정 (`discord_id` 사전 등록, 첫 로그인 시 `user_id` 자동 연결) |
| `seasons` | 시즌 목록 (`is_active` 하나만 true 가능) |
| `hall_of_fame` | 시즌 마감 시점의 랭크 스냅샷 (+`member_name_snapshot`으로 추방 후에도 이름 보존) |
| `profile_frames` | 프로필 프레임 메타데이터 |
| `tft_matches` | 매치 메타데이터 |
| `tft_match_participants` | 멤버별 매치 결과 |
| `sync_logs` | 동기화 감사 로그 |

## 멤버 자가 등록 / 승인 워크플로

`members.status`는 `'pending' | 'approved' | 'rejected'` 세 값만 가진다 (`MemberStatus`).

```
[사용자] /profile → MemberSelfForm → POST /api/me/member
    → 대상 행은 오직 세션 user_id로 특정 (body의 id는 절대 신뢰하지 않음)
    → member_name / riot_game_name / riot_tagline 3개 컬럼만 화이트리스트로 수용
    → 항상 status='pending'. 승인된 멤버가 Riot ID를 바꿔도 pending 복귀
       (REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE 상수로 제어 — 랭킹 조작 방지)

[관리자] /admin/members/control
    → GET  /api/admin/members[?status=pending]  대기/전체 탭, 로그인 연결 배지
    → POST /api/admin/members/[id]/approve      승인 + 즉시 동기화
    → POST /api/admin/members/[id]/reject       거절 + 사유(≤200자)
    → DELETE /api/admin/members/[id]            추방 (body.confirmName === member_name 필수)
```

**노출 필터:** `app/page.tsx`와 `app/custom-games/page.tsx`에서 `.eq('status','approved')`.
이 두 지점이 미승인 멤버 차단의 핵심이므로 members를 조회하는 공개 화면을 추가할 때 반드시 함께 적용한다.

**추방(완전 삭제):** FK의 `ON DELETE` 설정에 의존하지 않고
`app/api/admin/members/[id]/route.ts`에서 자식 테이블을 명시적으로 정리한 뒤 members를 삭제한다.
`hall_of_fame`만 예외로 삭제하지 않고 `member_id=null` + 이름 스냅샷을 남긴다.

**RLS 주의:** `members`에는 self-UPDATE 정책을 두지 않는다. RLS는 행 단위라 컬럼을 제한할 수 없어,
정책이 있으면 사용자가 콘솔에서 자기 `status`를 `approved`로 바꿀 수 있다.
정당한 self-UPDATE(프로필 이미지/프레임, Riot ID 신청)는 전부 서버 라우트에서 service role로 수행한다.

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
- 크론 엔드포인트(`GET /api/admin/sync-all`)는 `Authorization: Bearer CRON_SECRET`(또는 `ADMIN_SYNC_TOKEN`) 헤더 필수
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
