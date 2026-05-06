# 롤체 컴퍼니 (lolche-company)

카카오톡 단톡방 멤버 전용 TFT(Teamfight Tactics) 랭킹 추적 서비스.
Riot Games API로 TFT 솔로/더블업 랭크를 동기화하고 실시간 리더보드를 제공한다.

## 기술 스택

- **프레임워크:** Next.js 16 (App Router) + React 19 + TypeScript 5
- **데이터베이스:** Supabase (PostgreSQL)
- **외부 API:** Riot Games TFT API
- **스타일:** Tailwind CSS v4 + Framer Motion
- **인증:** Supabase Auth (이메일/패스워드)
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
  login/                        # 사용자 로그인
  profile/                      # 프로필 이미지·프레임 편집
  api/                          # API 라우트
    members/[id]/sync/route.ts  # 개별 멤버 동기화 (쿨다운 적용)
    admin/
      sync-all/route.ts         # 전체 멤버 동기화 (크론/수동)
      members/                  # 멤버 CRUD API
      profile-frames/           # 프레임 업로드·삭제 API
    profile/                    # 프로필 이미지·프레임 저장 API

lib/
  supabase.ts                   # anon 클라이언트 + 브라우저 클라이언트
  supabaseAdmin.ts              # service role 클라이언트 (서버 전용)
  supabase/
    service.ts                  # supabaseService (service role, 서버 전용)
    browser.ts                  # createClient factory (브라우저)
  sync/
    syncMember.ts               # 재시도 + 지수 백오프 래퍼
    doSyncMember.ts             # Riot API 실제 호출 + DB 업데이트
    writeSyncLog.ts             # sync_logs 테이블 감사 로그
  actions/
    season-actions.ts           # 시즌 Server Actions

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
ADMIN_SYNC_TOKEN=                   # 크론 트리거용 시크릿
RIOT_MATCH_DETAIL_DELAY_MS=1200     # 매치 API 호출 간격(ms)
NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC=300  # 프론트 쿨다운 표시용
```

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
  → POST /api/admin/sync-all (Authorization: Bearer ADMIN_SYNC_TOKEN)
      → 모든 멤버 순차 동기화
```

## Riot API 에러 처리

- `429`: `Retry-After` 헤더 존중, 없으면 30초 대기 후 재시도
- `502/503/504`: 재시도 가능 상태코드
- 나머지: 즉시 실패 처리
- `SyncError` 클래스 사용 (`lib/sync/syncMember.ts`)

## 코드 규칙

- **타입:** `any` 사용 금지. catch 블록은 `catch (e)` + `e instanceof Error ? e.message : 'fallback'` 패턴 사용
- **Supabase 쿼리:** 필요한 컬럼만 `select`로 지정 (Server Component에서 `*` 지양)
- **catch 패턴:**
  ```ts
  // ❌ 금지
  catch (e: any) { ... e.message ... }

  // ✅ 올바른 패턴
  catch (e) { someHandler(e instanceof Error ? e.message : '오류 발생') }
  ```
- **Server Action:** `lib/actions/` 폴더, 파일 상단에 `'use server'` 선언
- **Client Component:** 파일 상단에 `'use client'` 선언
- **이미지:** `<img>` 대신 `next/image`의 `<Image />` 사용 (외부 URL 허용 도메인: `**.supabase.co`)

## DB 주요 테이블

| 테이블 | 설명 |
|---|---|
| `members` | 멤버 정보 + TFT 랭크 + 동기화 상태 |
| `admins` | 관리자 계정 (`user_id` → Supabase Auth) |
| `seasons` | 시즌 목록 (`is_active` 하나만 true 가능) |
| `hall_of_fame` | 시즌 마감 시점의 랭크 스냅샷 |
| `profile_frames` | 프로필 프레임 메타데이터 |
| `tft_matches` | 매치 메타데이터 |
| `tft_match_participants` | 멤버별 매치 결과 |
| `sync_logs` | 동기화 감사 로그 |

## 관리자 기능

- `/admin/members/control` — 멤버 CRUD (Riot ID 수정 시 자동 재동기화)
- `/admin/members/sync` — 개별/전체 동기화, 동기화 현황 테이블
- `/admin/seasons` — 시즌 생성·활성화·종료, 명예의 전당 마감
- `/admin/profile-frames` — 프레임 이미지 업로드·삭제

관리자 여부는 `admins` 테이블에서 확인 (`/api/admin/me` 엔드포인트).
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

## 주의 사항

- `SUPABASE_SERVICE_ROLE_KEY`는 RLS를 우회하므로 서버 사이드에서만 사용
- 크론 엔드포인트(`/api/admin/sync-all`)는 `Authorization: Bearer ADMIN_SYNC_TOKEN` 헤더 필수
- 멤버 동기화는 기본 쿨다운 300초 (프론트: `NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC`, 백: `doSyncMember.ts` 내 10분)
- 프로필 이미지: Supabase Storage `profile-images` 버킷
- 프레임 이미지: Supabase Storage `profile-frames` 버킷
