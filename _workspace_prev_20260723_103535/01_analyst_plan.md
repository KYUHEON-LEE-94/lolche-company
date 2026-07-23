# 분석 결과 — 대시보드 개편 / 다중 라이엇 계정 / 스팀 / LoL 페이지

## 작업 요약
`/`를 대시보드로 승격하고 TFT 랭킹을 `/tft`로 이관, `members`의 단일 라이엇 계정을 `riot_accounts` 자식 테이블로 정규화(최대 3개 + 대표 1개), 스팀은 **API 키 없이** 커뮤니티 XML로 접속/플레이 상태만 표시하는 `/steam` 신설, 기존 라이엇 계정을 재사용하는 `/lol` 신설.

## ⚠ 사용자 결정 반영 (2026-07-23)
- 스팀 Web API 키를 쓰지 않는다. → **보유 게임·플레이타임·"함께 할 수 있는 게임"·플레이타임 랭킹은 전부 범위에서 제외.**
- 대신 **"현재 스팀 플레이 중인 사용자" 표시만** 구현한다.
- 구현 수단: 스팀 커뮤니티 XML 엔드포인트(키 불필요, **비공식**)
  - `https://steamcommunity.com/id/{vanity}/?xml=1`
  - `https://steamcommunity.com/profiles/{steamid64}/?xml=1`
  - 얻을 수 있는 필드: `steamID64`, `steamID`(닉네임), `avatarFull`, `onlineState`(online/offline/in-game), `stateMessage`(플레이 중인 게임명), `privacyState`
  - ⚠ 비공식 API이므로 밸브가 예고 없이 차단 가능. 레이트리밋 미문서화. 향후 키 발급 시 `GetOwnedGames` 기반 기능으로 확장 가능하도록 설계할 것.
  - **Developer는 착수 전 실제 요청 1회로 XML 스키마를 검증할 것.**
- 따라서 `steam_apps`, `steam_owned_games` 테이블은 **만들지 않는다.**

---

## 0. 확인된 사실 (실측)

| 항목 | 실측 결과 |
|---|---|
| 라이엇 계정 컬럼 | `members.riot_game_name`(NOT NULL), `riot_tagline`(NOT NULL), `riot_puuid`(nullable), `tft_summoner_id`(선언만, 코드 미사용) |
| `tft_match_participants` | `member_id`(nullable) + `puuid` 양쪽 보유. 조회·삭제·삽입 전부 `member_id` 기준 |
| 내전 puuid 매핑 | `app/api/custom-games/[id]/rounds/route.ts:50-73`에서 `members.riot_puuid` → `member_id` 역매핑 Map. **다중 계정의 직격탄** |
| 티어 상수 | `lib/constants/tierOrder.ts` — `TIER_ORDER`(CHALLENGER=1…IRON=10), `RANK_ORDER`(I=1…IV=4). 게임 중립적 |
| 네비게이션 | 전역 nav 없음. 실질 헤더가 `app/MemberRanking.tsx:512-523`에 인라인. 관리자만 `app/admin/layout.tsx`에 별도 nav |
| 미들웨어 | `/login`, `/auth/callback`, `/auth/confirm`만 공개. `/api/*` 통과, `/api/admin/sync-all` BYPASS. **신규 페이지는 자동으로 로그인 게이트 적용** |
| Riot 클라이언트 | `lib/riot/api.ts`의 `riotFetch()`가 `X-Riot-Token` 부착. base URL 3종을 전체 URL 프리픽스로 env 주입 |
| 크론 | `vercel.json` — `/api/admin/sync-all` 1건뿐 |
| `revalidatePath('/')` 호출처 | `api/me/member`(4곳), `admin/members/create`, `update`, `[id]` DELETE, `approve`, `reject` = **총 9곳** |

---

## 1. 판정 ①: 다중 라이엇 계정 → **`riot_accounts` 자식 테이블 (확정)**

### 컬럼 3벌 확장안이 부적합한 이유
- TFT 랭크 컬럼이 solo 5 + doubleup 5 + prev 3 = 13개. ×3이면 **+26 컬럼**. 비현실적.
- 내전 puuid 역매핑이 3컬럼 OR 조건으로 폭발.
- "대표 계정"을 슬롯 번호로 표현하면 삭제 시 재배열 로직 필요 → 원자성 깨짐.
- "한 puuid는 한 사람만" 유니크 제약을 3개 컬럼 교차로 걸 수 없음.

### 채택안
```
members (1) ──< riot_accounts (N ≤ 3), is_primary 정확히 1개
```
**TFT 랭크 컬럼을 `riot_accounts`로 이동하되, `members.tft_*`는 대표 계정 값의 비정규화 캐시로 유지.**
→ 랭킹 쿼리(`app/page.tsx`)와 `MemberRanking.tsx`(500줄+), 명예의 전당을 Phase 2에서 건드리지 않아도 된다. **리스크를 가장 크게 줄이는 선택.**

### 마이그레이션 SQL 초안 — `scripts/sql/20260724_riot_accounts.sql`

```sql
-- STEP 0. 사전 확인 (읽기 전용)
-- select riot_puuid, count(*) from public.members
--  where riot_puuid is not null group by 1 having count(*) > 1;
-- select lower(riot_game_name), lower(riot_tagline), count(*)
--   from public.members group by 1,2 having count(*) > 1;

-- STEP 1. 테이블 생성
create table if not exists public.riot_accounts (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members(id) on delete cascade,
  riot_game_name  text not null,
  riot_tagline    text not null,
  riot_puuid      text,
  is_primary      boolean not null default false,

  tft_tier text, tft_rank text, tft_league_points int,
  tft_wins int,  tft_losses int,
  tft_doubleup_tier text, tft_doubleup_rank text, tft_doubleup_league_points int,
  tft_doubleup_wins int,  tft_doubleup_losses int,
  tft_tier_prev text, tft_rank_prev text, tft_lp_prev int,
  tft_recent5 text,

  lol_summoner_id text,
  lol_tier text, lol_rank text, lol_league_points int,
  lol_wins int, lol_losses int,
  lol_synced_at timestamptz,

  last_synced_at timestamptz,
  created_at timestamptz not null default now()
);

-- STEP 2. 인덱스 / 제약
create index if not exists riot_accounts_member_id_idx on public.riot_accounts(member_id);

create unique index if not exists riot_accounts_puuid_uidx
  on public.riot_accounts(riot_puuid) where riot_puuid is not null;

create unique index if not exists riot_accounts_riotid_uidx
  on public.riot_accounts(lower(riot_game_name), lower(riot_tagline));

create unique index if not exists riot_accounts_primary_uidx
  on public.riot_accounts(member_id) where is_primary;

-- 멤버당 최대 3개 — 앱 검증만으로는 동시요청 경합을 못 막으므로 트리거로 강제
create or replace function public.riot_accounts_limit_check()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.riot_accounts where member_id = new.member_id) >= 3 then
    raise exception '라이엇 계정은 멤버당 최대 3개까지 등록할 수 있습니다.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists riot_accounts_limit_trg on public.riot_accounts;
create trigger riot_accounts_limit_trg
  before insert on public.riot_accounts
  for each row execute function public.riot_accounts_limit_check();

-- STEP 3. 기존 members 백필 (모두 대표 계정으로)
insert into public.riot_accounts (
  member_id, riot_game_name, riot_tagline, riot_puuid, is_primary,
  tft_tier, tft_rank, tft_league_points, tft_wins, tft_losses,
  tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_league_points,
  tft_doubleup_wins, tft_doubleup_losses,
  tft_tier_prev, tft_rank_prev, tft_lp_prev, tft_recent5, last_synced_at
)
select m.id, m.riot_game_name, m.riot_tagline, m.riot_puuid, true,
  m.tft_tier, m.tft_rank, m.tft_league_points, m.tft_wins, m.tft_losses,
  m.tft_doubleup_tier, m.tft_doubleup_rank, m.tft_doubleup_league_points,
  m.tft_doubleup_wins, m.tft_doubleup_losses,
  m.tft_tier_prev, m.tft_rank_prev, m.tft_lp_prev, m.tft_recent5, m.last_synced_at
from public.members m
where not exists (select 1 from public.riot_accounts r where r.member_id = m.id);

-- STEP 4. RLS — members와 동일 원칙: self-UPDATE/INSERT/DELETE 정책 금지
alter table public.riot_accounts enable row level security;
drop policy if exists riot_accounts_select_all on public.riot_accounts;
create policy riot_accounts_select_all on public.riot_accounts for select using (true);
-- ⚠ update/insert/delete 정책은 절대 만들지 않는다. (RLS는 컬럼 제한 불가 →
--   is_primary/tft_tier를 콘솔에서 직접 조작 가능해짐)

-- STEP 5. (Phase 6에서만) 레거시 컬럼 정리
-- alter table public.members
--   alter column riot_game_name drop not null,
--   alter column riot_tagline   drop not null;

-- STEP 6. 검증
-- select count(*) from public.members;
-- select count(*) from public.riot_accounts where is_primary;   -- 위와 같아야 함
-- select member_id, count(*) from public.riot_accounts group by 1 having count(*) > 3;
```

### 영향 범위 전수 목록

| 파일 | 조치 | Phase |
|---|---|---|
| `types/supabase.ts` | `RiotAccount` 타입 신설. `Member.riot_*`는 캐시로 유지 | 1 |
| `lib/sync/doSyncMember.ts` | **핵심 개편**: `riot_accounts` 순회 동기화 → 대표 값을 `members.tft_*`에 미러링 | 2 |
| `lib/sync/syncMember.ts` | 멤버 단위 잠금 유지. 변경 최소 | 2 |
| `app/api/me/member/route.ts` | 대표 계정 1개 등록 경로로 축소. 인계 로직을 `riot_accounts` 기준 재작성 | 2 |
| `lib/members/memberInput.ts` | `parseMemberInput`(닉네임) / `parseRiotAccountInput`(계정) 분리 | 2 |
| `app/profile/MemberSelfForm.tsx` | 계정 목록 UI(추가/삭제/대표지정, 최대 3) | 2 |
| `app/profile/page.tsx` | `riot_accounts` 조인 조회 | 2 |
| `app/api/admin/members/create|update|route|[id]` | 계정 테이블 연동. **DELETE의 `CHILD_TABLES`에 `riot_accounts` 추가 필수** | 2 |
| `app/admin/members/control/page.tsx`, `sync/page.tsx` | 계정 목록 표시/편집 | 2 |
| `app/MemberRanking.tsx` | 캐시 컬럼 덕에 Phase 1~2 **무변경** | 3 |
| `app/components/ranking/MemberDetailPanel.tsx` | 계정 선택 탭 | 3 |
| `app/api/custom-games/[id]/route.ts`, `rounds/route.ts` | puuid Map을 `riot_accounts` 전체로 확장(부계정 내전 인식 — 기능 개선) | 3 |
| `app/custom-games/*` | 대표 계정 표시 | 3 |
| `app/hall-of-fame/*`, `api/members/[id]/matches|history` | **무변경** (riot_* 미참조 확인) | — |

### 판정 ②: 매치 귀속
- `tft_match_participants`는 `member_id`로 조인한다. **계정 3개여도 매치는 같은 `member_id`에 자동 합산** → 스키마 변경 불필요.
- ⚠ 단 `doSyncMember.ts:135-139`의 삭제 조건이 `(match_id, member_id)`라 **부계정끼리 같은 매치에 참여하면 두 번째 처리 시 첫 계정 행을 지운다.** → 키를 `(match_id, puuid)`로 바꾸고 upsert 전환. Phase 2 필수.
- UI 노출은 기본 "대표 계정 매치만", 상세에서 계정 전환 시 해당 puuid로 필터.

---

## 2. 판정 ③: LoL API

### 엔드포인트
```
GET https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid/{puuid}
  → [{ queueType: "RANKED_SOLO_5x5" | "RANKED_FLEX_SR", tier, rank, leaguePoints, wins, losses }]
```
- **summoner id 변환 불필요.** `by-puuid` 엔트리 엔드포인트 사용.
- 응답 형태가 TFT와 동일 → `TftLeagueEntry` 타입 재사용 가능.
- **puuid는 게임 간 공유** → 이미 저장된 puuid 그대로 사용. **추가 입력 없음** (요청 조건 충족).

### 환경변수
```
RIOT_LOL_LEAGUE_BASE_URL=https://kr.api.riotgames.com/lol/league/v4/entries/by-puuid
```

### ⚠ API 키 공유 가능 여부 — 배포 전 필수 검증
- 개발용 키(24h): 전 엔드포인트 허용 → 즉시 동작
- **프로덕션 키: Riot 승인이 제품 단위.** TFT로만 승인됐으면 LoL은 **403**
- → **Phase 4 착수 전 실제 curl로 200/403 확인.** 403이면 Riot Developer Portal에서 LoL 제품 추가 승인 필요 = 코드로 해결 불가한 **일정 리스크**
- 403 시: `/lol`을 "데이터 준비 중"으로 degrade

### 저장 위치
`riot_accounts`의 `lol_*` 컬럼(STEP 1에 포함). 1:1 관계 + 컬럼 6개라 별도 테이블은 조인 비용만 늘어남.

### 판정 ④: 티어 정렬 공유
**가능.** LoL·TFT 모두 티어 10종 + 디비전 I~IV 동일. 마스터+ 는 항상 `I` → `RANK_ORDER['I']=1`로 자연 처리.
`lib/constants/tierOrder.ts`에 `compareRank(a,b)`를 추출해 `MemberRanking.tsx`(현재 인라인)와 `/lol`이 공유.

---

## 3. 판정 ⑤: 네비게이션 → **`/` = 대시보드, 랭킹은 `/tft`**

`/dashboard`를 추가하고 `/`를 랭킹으로 두면 로그인 리다이렉트 목적지(`middleware.ts`, `auth/callback`)를 전부 손봐야 한다. `/`를 대시보드로 만들면 **미들웨어 무변경**.

1. `app/page.tsx` → `app/tft/page.tsx` (`revalidate = 60` 유지), `app/MemberRanking.tsx` → `app/tft/MemberRanking.tsx`
2. 신규 `app/page.tsx` = 대시보드(Server Component)
3. **`revalidatePath('/')` → `revalidatePath('/tft')` 전수 교체 (9곳).** 누락 시 랭킹이 무기한 stale
4. `app/custom-games/page.tsx:202`의 `href="/"` 확인
5. **전역 nav 신설** `app/components/SiteNav.tsx` (Client, `usePathname` active)
   - 항목: 대시보드`/` · 롤체`/tft` · 롤`/lol` · 스팀`/steam` · 내전`/custom-games` · 명예의 전당`/hall-of-fame` · `<AuthButtons />`
   - `/admin/*`은 자체 레이아웃, `/login`은 nav 불필요 → **route group `app/(main)/layout.tsx`로 분리 권장**
   - `MemberRanking.tsx:512-523`의 인라인 헤더 제거

---

## 4. 스팀 (축소된 범위)

### 마이그레이션 — `scripts/sql/20260724_steam.sql`
```sql
alter table public.members
  add column if not exists steam_id64       text,
  add column if not exists steam_persona    text,
  add column if not exists steam_avatar_url text,
  add column if not exists steam_visibility text,   -- 'public' | 'private' 등 XML privacyState
  add column if not exists steam_linked_at  timestamptz;

create unique index if not exists members_steam_id64_uidx
  on public.members(steam_id64) where steam_id64 is not null;
```
`steam_apps` / `steam_owned_games`는 **만들지 않는다** (API 키 필요 기능 제외).

### 구현
- `lib/steam/communityXml.ts` — XML 조회·파싱. **Developer는 실제 요청으로 스키마를 먼저 검증할 것.**
  - vanity/URL/SteamID64 4형태 정규화: `^\d{17}$`, `/profiles/(\d{17})`, `/id/([A-Za-z0-9_-]{2,32})`, 맨 vanity
  - `?xml=1` 응답에서 `steamID64`, `steamID`, `avatarFull`, `onlineState`, `stateMessage`, `privacyState` 추출
- `app/api/me/steam/route.ts` — GET/POST/DELETE. **세션 user_id 기반 소유권 검증** (`/api/me/member` 패턴 준수). body의 member id 미신뢰
- `app/api/steam/status/route.ts` — 승인된 멤버 중 `steam_id64`가 있는 사람들의 현재 상태를 조회. **XML 호출이 멤버 수만큼 발생하므로 서버 캐시 필수** (Next `revalidate` 60초 또는 `unstable_cache`). 비공식 API라 과호출 시 차단 위험
- `app/steam/page.tsx` — "지금 게임 중" / "온라인" / "오프라인" 3그룹. 비공개 프로필은 안내 배지
- **소유권 검증 불가** (스팀 OpenID 미사용) → `members_steam_id64_uidx` 유니크로 선점만 차단, 409 응답. 관리자 승인 게이트는 두지 않음
- `status='approved'` 멤버만 집계 (CLAUDE.md 노출 필터 규칙)

---

## 5. Phase 분할 (독립 배포 단위 · 우선순위)

### **Phase 1 — 네비게이션 + 대시보드** (SQL 없음, 리스크 최소, 다른 Phase의 선행 조건)
`app/page.tsx` → `app/tft/`, 대시보드 신규, `SiteNav`, `revalidatePath` 9곳 치환, 인라인 헤더 제거.

### **Phase 2 — `riot_accounts` 스키마 + 자가등록/관리자 CRUD 이관** (최대 리스크)
SQL STEP 0~4 → 배포. `doSyncMember` 다중 계정화 + 미러링, `(match_id, puuid)` 키 전환, 계정 관리 UI, DELETE에 `riot_accounts` 추가.
**랭킹 UI는 캐시 컬럼 덕에 무변경 → 이 Phase에서 화면이 깨지지 않는다.**
롤백: 추가 테이블이므로 코드만 되돌리면 복구(`members.riot_*` 생존).

### **Phase 3 — 다중 계정 노출 + 내전 연동**
상세 패널 계정 탭, 매치 puuid 필터, 내전 puuid Map 확장.

### **Phase 4 — LoL 페이지**
⚠ 착수 전 프로덕션 키 403 확인. `RIOT_LOL_LEAGUE_BASE_URL`, `fetchLolLeaguesByPuuid`, 대표 계정만 LoL 동기화, `/lol`, `compareRank` 공용화.

### **Phase 5 — 스팀 (축소판)**
SQL → XML 스키마 검증 → 정규화/검증, `/api/me/steam`, 캐시된 상태 조회, `/steam` UI.

### **Phase 6 — 레거시 정리 (선택)**
`members.riot_*` NOT NULL 해제 → DROP. 전 코드 grep 0건 확인 후에만.

---

## 6. 위험 요소

| # | 위험 | 심각도 | 완화 |
|---|---|---|---|
| R1 | **대표 계정 전환이 승인 우회 경로** — Riot ID 변경 시 pending 복귀 규칙을 "계정 추가 후 대표 전환"으로 우회하면 승인 없이 챌린저 계정을 랭킹에 올릴 수 있다 | **최상(보안)** | 대표 전환/계정 추가에도 동일 규칙 적용: `is_primary` 변경 API가 `status='pending'` + `approved_at/by=null`로 복귀. **Phase 2 필수 수용 기준** |
| R2 | `riot_accounts`에 self-UPDATE RLS 정책 추가 | **최상(보안)** | SQL STEP 4 주석 명시. 모든 쓰기는 service role 라우트 |
| R3 | 남의 라이엇 계정 등록/탈취 | 상(보안) | puuid·RiotID 전역 유니크 → 409. 삭제/대표전환 API에 `.eq('member_id', myMemberId)` 가드 필수 |
| R4 | 비공식 스팀 XML 차단·레이트리밋 | 중 | 서버 캐시(60초+) 필수. 실패 시 500이 아니라 "상태 확인 불가"로 degrade |
| R5 | 동기화 Riot 콜 3배 증가 | 상(성능) | **매치 상세는 대표 계정만** 수집, 부계정은 리그 정보만. 배치 크기 축소 |
| R6 | `tft_match_participants` 부계정 동시 참여 시 행 삭제 | 중(데이터 손실) | `(match_id, puuid)` 유니크 + upsert |
| R7 | `revalidatePath('/')` 누락 | 중 | Phase 1에서 9곳 전수 grep |
| R8 | LoL 프로덕션 키 403 | 중(일정) | Phase 4 착수 전 curl 검증. 403이면 Phase 5를 먼저 |
| R9 | 스팀 ID 선점 | 하 | 유니크 인덱스 + 관리자 해제 |
| R10 | `members` insert + `riot_accounts` insert 비원자성 | 중 | RPC로 묶거나 실패 시 보상 delete |

---

## 7. QA 검증 포인트

**Phase 1**
- [ ] `/` 대시보드, `/tft` 랭킹, 비로그인 `/tft` → `/login?next=%2Ftft`
- [ ] 관리자 승인 → `/tft`가 60초 내 반영 (revalidate 경로 교체 확인)
- [ ] `/admin/*`·`/login`에 SiteNav 미노출

**Phase 2 (핵심)**
- [ ] `count(members)` == `count(riot_accounts where is_primary)`
- [ ] 계정 4개째 추가 → 트리거 거부. 동시 요청 2건으로도 3개 초과 불가
- [ ] 타인 `accountId`로 DELETE/primary 호출 → 403/404, 남의 행 무변경
- [ ] 이미 등록된 Riot ID 추가 → 409
- [ ] **approved 멤버가 부계정 추가 후 대표 전환 → `status`가 pending 복귀** (R1)
- [ ] 대표 계정 삭제 시도 → 거부(다른 계정을 먼저 대표로)
- [ ] 동기화 후 `members.tft_tier` == 대표 `riot_accounts.tft_tier`
- [ ] 추방 → `riot_accounts` 0건, `hall_of_fame` 스냅샷 보존

**Phase 4**
- [ ] 추가 입력 없이 LoL 티어 표시, 언랭 최하단, 마스터+ LP 내림차순
- [ ] LoL 403 시 500이 아니라 안내로 degrade

**Phase 5**
- [ ] 4형태 입력 모두 정규화, 없는 vanity → 400
- [ ] 비공개 프로필 → 경고 배지
- [ ] 이미 등록된 SteamID64 → 409
- [ ] `/steam` 렌더가 캐시를 쓰고 매 요청마다 XML을 때리지 않음
- [ ] `status != 'approved'` 멤버 미포함

**공통**
- [ ] SQL 먼저 → 배포 나중
- [ ] service role 클라이언트가 Client Component에 import되지 않음
- [ ] `tsc` / `lint` / `build` 통과, `any` 0건

---

## 8. CLAUDE.md 갱신 항목
디렉토리 구조(`app/tft`, `app/lol`, `app/steam`), 환경변수(`RIOT_LOL_LEAGUE_BASE_URL`), DB 테이블(`riot_accounts`, `members.steam_*`), 노출 필터에 `/steam`·`/lol` 추가, 하네스 변경 이력.
