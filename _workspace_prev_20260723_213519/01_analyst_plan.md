# 분석 결과 — A: 다중 라이엇 계정 / B: 내전 개편

## 0. 실측 사실

| # | 항목 | 실측 |
|---|---|---|
| F1 | **내전 API에 `requireAdmin()`이 한 곳도 없다** | `app/api/custom-games/**` 9개 파일 grep 0건. 전부 `getCurrentUser()`만. **로그인한 아무나** 생성·삭제·종료·라운드추가·게스트추가/삭제·팀배정 가능 |
| F2 | `custom_games` 컬럼 | `id, title, status('in_progress'|'ended'), game_type('solo'|'team'), max_rounds, created_at, ended_at`. **주최자·정원·일정·게임종류 없음** |
| F3 | **`game_type`은 이미 점유됨** | `'solo'|'team'`(개인전/2인팀전). 신규 "게임 종류"를 여기 넣으면 `teams/route.ts:37`, `rounds/route.ts:110`, `[id]/route.ts:104`가 깨진다 → **별도 컬럼 필수** |
| F4 | `custom_game_participants` | `id, custom_game_id, member_id, joined_at`. 참가자는 생성 시 `participant_ids[]`로 일괄 INSERT만 되고 **추가/제거 API가 없다** |
| F5 | `custom_game_guests` | `riot_puuid` 보유 → **TFT 전용 개념** |
| F6 | 결과 수집 | `rounds/route.ts`가 `findCommonMatch()` 호출. **TFT 매치 전제. 롤/스팀/기타 불가** |
| F7 | 정원 | 하드코딩 상수 `8`. 팀전은 `=== 8` 강제 |
| F8 | 참가자 UI | `app/custom-games/page.tsx:93-99`가 anon 클라이언트로 members 직접 조회 |
| F9 | 추방 시 자식 정리 | `CHILD_TABLES`에 custom_game_* 3종 포함. `riot_accounts`는 미추가(A에서 필요) |
| F11 | `custom_games` DDL이 리포지토리에 없다 | STEP 0 실측 필요 |
| **F16** | **실측(2026-07-23): `custom_games` 0건, `custom_game_participants` 0건** | **기존 데이터 없음 → 백필 불필요, `host_member_id`를 NOT NULL로 설계 가능** |
| **F17** | **실측: `20260724_lol_rank.sql`·`20260724_steam.sql` 둘 다 실행 완료** | `lol_*`, `steam_*`, `steam_owned_games` 존재 확인. A1 불필요 |

---

## 1. 판정 — A (다중 라이엇 계정)

- **A-1: `members.lol_*` → `riot_accounts`로 이동 + `members`에 캐시 유지.** LoL 티어는 계정 단위 지표이므로 TFT와 동일 취급. `/lol` 페이지는 캐시 덕에 무변경.
- **A-2: `members.steam_*` → `members`에 유지.** 스팀 계정은 라이엇 계정과 1:1 대응이 없고 `steam_owned_games.member_id`가 members를 본다. 사람 단위가 맞다.
- **A-3: 직전 `riot_accounts` SQL 초안 승계.** 변경점: `lol_summoner_id` 삭제(by-puuid 사용), `lol_*` 컬럼명을 `20260724_lol_rank.sql`과 일치, `steam_*` 미포함.
- **A-4: 실행 순서** — lol/steam SQL은 이미 실행됨(F17). `20260725_riot_accounts.sql`만 실행하면 된다. 백필 SELECT에 `m.lol_*` 6개 포함.

### A 위험
- **A-R1 (최상)**: 부계정 추가 → 대표 전환으로 승인 우회. 대표 전환/계정 추가 API도 `status='pending'` 복귀 적용
- **A-R2 (최상)**: `riot_accounts`에 self-UPDATE RLS 금지. select 정책만
- **A-R6**: `doSyncMember`의 매치 삭제 키 `(match_id, member_id)` → 부계정 동시 참여 시 행 소실. `(match_id, puuid)` 유니크 + upsert
- **A-R11**: `CHILD_TABLES`에 `riot_accounts` 추가 필수(리프 순서 맨 앞)

---

## 2. 판정 — B (내전 개편)

### B-1: 요구사항 "비관리자도 생성"은 **이미 충족**. 진짜 문제는 반대 방향
현재 누구나 남의 내전을 삭제·종료·강퇴할 수 있다(F1). B의 권한 작업은 **"주최자 본인 + 관리자"로 조이는 보안 수정**이다. 최우선.

### B-2: 게임 종류는 신규 컬럼 `game_kind` (`game_type`과 분리)
```
game_kind: 'tft' | 'lol' | 'steam' | 'etc'   NOT NULL default 'tft'
game_kind_label: text    -- 'etc'일 때만, ≤30자
game_type: 'solo'|'team' -- 기존 유지, game_kind='tft'일 때만 의미
```
CHECK로 `game_kind='etc'` ↔ 라벨 존재를 상호 강제.

### B-3: 대기자 자동 승격 — **상태를 저장하지 말고 순번에서 파생** ★ 핵심
`status('confirmed'|'waitlisted')`를 물리 컬럼으로 저장하면 취소마다 승격 UPDATE가 필요하고, 동시 취소 2건이 같은 대기자를 중복 승격하거나 아무도 승격 못 하는 경합이 생긴다. 앱 코드로는 못 막는다.

**채택: `order by joined_at, id` 상위 `capacity`명이 confirmed, 나머지가 waitlist.**
- 취소 = DELETE 1건. **승격 로직이 존재하지 않으므로 승격 경합도 존재하지 않는다**
- 정원 상/하향, 동시 취소, 취소+신청 동시 발생 모두 자동으로 올바름. 추가 코드 0줄
- `seq` 컬럼 불필요 — `joined_at` + tie-break `id`로 충분. `(custom_game_id, joined_at, id)` 인덱스만 추가

**그럼에도 DB 제약이 필요한 2곳:**
1. **중복 신청 차단** → `unique (custom_game_id, member_id)`. 앱의 select→insert로는 더블클릭·동시요청을 반드시 뚫린다. **필수.** 23505 → 409 매핑
2. 대기자 무한 증식 → 총 신청 상한 `min(capacity*3, 60)`. 정확도 요구가 낮아 앱 count로 충분

**RPC 불필요.** INSERT 1건/DELETE 1건이 전부이고 정합성은 유니크 인덱스가 보장한다.

### B-4: 일자·시간 → `scheduled_at timestamptz` 단일 컬럼, **변환은 서버에서**
`<input type="datetime-local">`은 브라우저 로컬 타임존으로 해석되므로 클라이언트에서 ISO 변환하면 안 된다.
클라이언트는 `"YYYY-MM-DD"` + `"HH:mm"` 문자열 전송 → 서버가 `new Date(\`${date}T${time}:00+09:00\`)`로 변환(한국은 서머타임 없음). 표시도 `Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul'})` 고정.

### B-5: 결과 수집 분기 → `game_kind !== 'tft'`면 rounds/teams/guests API를 **400으로 차단**
UI 숨김만으로는 부족하다. 서버 가드 필수. 롤/스팀/기타는 "모집·참가 관리 전용"으로 정의(수동 결과 입력은 범위 밖).

### B-6: 상태 머신
```
recruiting → in_progress → ended
recruiting → cancelled
```
`recruiting`에서만 참가/취소 가능. F16으로 기존 데이터가 0건이므로 CHECK 제약을 안전하게 추가할 수 있다.

### B-7: 참가 자격 → `members.status='approved'` 필수 (생성도 동일). 서버에서 강제

### B-8: 주최자 → `host_member_id`, **F16 덕에 NOT NULL 가능**
값은 세션 user_id → members 조회 결과로만 채운다. body의 어떤 필드도 신뢰하지 않는다.
권한 헬퍼 `lib/customGames/authorize.ts`:
```ts
canManageGame(game, viewerMemberId, isAdmin) =
    isAdmin || (game.host_member_id !== null && game.host_member_id === viewerMemberId)
```
⚠ `null === null` 통과 버그를 반드시 방어.

### B-9: 남용 방지
| 벡터 | 대응 |
|---|---|
| 무한 모집글 | 동일 host의 `status in ('recruiting','in_progress')` **동시 3개 제한** |
| 과거 날짜 | `scheduled_at >= now() - 10분`, 상한 `now() + 90일` |
| 정원 남용 | `capacity` 2~100. `tft`+`team`이면 8 강제 |
| 문자열 | `title ≤60자`, `game_kind_label ≤30자`, 빈값 거부 |
| 참가 스팸 | 유니크 인덱스 + 총 신청 상한 |

### B-10: RLS — `custom_game_participants`에 **self-INSERT/DELETE 정책 금지**
만들면 사용자가 콘솔에서 `joined_at`을 조작해 대기열을 새치기하거나 정원/승인 검증을 우회한다(`members_update_own` 사고와 동일 구조). select 정책만.

---

## 3. A ↔ B 의존관계 — **B를 먼저 할 수 있다** (권장)

- B는 `members`의 `id/member_name/status/user_id/discord_id`만 사용. `riot_*`은 참가자 표시용 읽기 1곳뿐이며 A 후에도 캐시 컬럼이 살아 있어 안 깨진다
- A-A3의 "내전 puuid Map 확장"만 겹치는데 B는 그 파일에 가드 한 줄만 추가 → 충돌 면적 극소
- **B-1이 현재 프로덕션에 열려 있는 보안 결함이므로 B 먼저**

---

## 4. Phase 분할

### **B1 — 내전 권한 하드닝** (SQL 없음, 최우선) 🔴 보안
`DELETE /[id]`, `POST .../end`, `.../teams`, `.../guests`, `DELETE .../guests/[guestId]`, `POST .../rounds`에 `requireAdmin()` 추가. B2에서 `canManageGame`으로 완화.
⚠ 생성(`POST /api/custom-games`)은 조이지 않는다(요구사항).

### **B2 — 스키마 + 모집/참가/대기열** (SQL 필요, 본체)
`20260725_custom_game_recruit.sql` → 코드 배포.
신규 API: `POST/DELETE /[id]/join`, `DELETE /[id]/participants/[participantId]`(강퇴), `PATCH /[id]`(수정).
`POST /api/custom-games` 재작성: `participant_ids` 제거, 주최자 자동 참가.
GET들에 `confirmed/waitlist` 파생 + `can_manage`, `my_participation`.

### **B3 — 내전 UI 개편**
모집 폼(일자/시간/정원/종류), 목록 `n/정원`·대기 배지·일정, 참가/취소 버튼, 확정/대기 명단 분리, 강퇴 버튼, `game_kind !== 'tft'`면 라운드/팀/게스트 숨김. `loadMembers()` anon 직접 조회 제거.

### **A2 — `riot_accounts` 스키마 + CRUD 이관** (최대 리스크)
### **A3 — 다중 계정 노출 + 내전 연동**
### **A4 — 레거시 정리** (선택)

**권장 순서: B1 → B2 → B3 → A2 → A3 → (A4)**

---

## 5. 마이그레이션 SQL 초안 — `scripts/sql/20260725_custom_game_recruit.sql`

```sql
-- STEP 0. 사전 확인 (읽기 전용)
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema='public' and table_name in ('custom_games','custom_game_participants')
--  order by table_name, ordinal_position;
-- select distinct status from public.custom_games;
-- select count(*) from public.custom_games;   -- 실측 0건
-- select custom_game_id, member_id, count(*) from public.custom_game_participants
--  group by 1,2 having count(*) > 1;          -- STEP 2 유니크 사전 검사

-- STEP 1. custom_games 모집 컬럼
alter table public.custom_games
  add column if not exists host_member_id  uuid references public.members(id) on delete set null,
  add column if not exists game_kind       text not null default 'tft',
  add column if not exists game_kind_label text,
  add column if not exists scheduled_at    timestamptz,
  add column if not exists capacity        int not null default 8;

alter table public.custom_games drop constraint if exists custom_games_game_kind_chk;
alter table public.custom_games add constraint custom_games_game_kind_chk
  check (game_kind in ('tft','lol','steam','etc'));

alter table public.custom_games drop constraint if exists custom_games_game_kind_label_chk;
alter table public.custom_games add constraint custom_games_game_kind_label_chk
  check (
    (game_kind = 'etc' and game_kind_label is not null
       and length(btrim(game_kind_label)) between 1 and 30)
    or (game_kind <> 'etc' and game_kind_label is null)
  );

alter table public.custom_games drop constraint if exists custom_games_capacity_chk;
alter table public.custom_games add constraint custom_games_capacity_chk
  check (capacity between 2 and 100);

-- 기존 데이터 0건이므로 status CHECK를 안전하게 추가할 수 있다
alter table public.custom_games drop constraint if exists custom_games_status_chk;
alter table public.custom_games add constraint custom_games_status_chk
  check (status in ('recruiting','in_progress','ended','cancelled'));

create index if not exists custom_games_host_idx
  on public.custom_games(host_member_id) where host_member_id is not null;
create index if not exists custom_games_schedule_idx
  on public.custom_games(scheduled_at desc nulls last);
create index if not exists custom_games_host_active_idx
  on public.custom_games(host_member_id, status)
  where status in ('recruiting','in_progress');

-- STEP 2. participants — 대기열은 순번 파생
-- ★ confirmed/waitlisted 컬럼을 만들지 말 것. 만들면 승격 UPDATE가 필요해지고
--   동시 취소 시 중복 승격/누락 경합이 생긴다. (joined_at, id) 정렬 상위 capacity명이 확정.
create index if not exists custom_game_participants_order_idx
  on public.custom_game_participants(custom_game_id, joined_at, id);

-- ★ 중복 신청 차단은 앱의 select→insert로는 불가능. 유니크 인덱스가 유일한 방어선.
create unique index if not exists custom_game_participants_uniq
  on public.custom_game_participants(custom_game_id, member_id);

-- STEP 3. RLS — select만. insert/update/delete 정책 금지
alter table public.custom_games enable row level security;
drop policy if exists custom_games_select_all on public.custom_games;
create policy custom_games_select_all on public.custom_games for select using (true);

alter table public.custom_game_participants enable row level security;
drop policy if exists custom_game_participants_select_all on public.custom_game_participants;
create policy custom_game_participants_select_all
  on public.custom_game_participants for select using (true);

-- STEP 4. 검증
-- select game_kind, count(*) from public.custom_games group by 1;
-- select indexname from pg_indexes where schemaname='public' and tablename='custom_game_participants';
```

### `scripts/sql/20260725_riot_accounts.sql`
직전 계획 초안 승계. 변경점: `lol_summoner_id` 삭제, `lol_*` 컬럼명 일치, STEP 3 백필에 `m.lol_*` 6개 추가.

---

## 6. 영향 파일

### B — 내전
| 파일 | 유형 | Phase |
|---|---|---|
| `scripts/sql/20260725_custom_game_recruit.sql` | 신규 | B2 |
| `types/supabase.ts` | 수정 (`CustomGame` 신규 컬럼, `CustomGameKind` 유니온) | B2 |
| `app/api/custom-games/route.ts` | 전면 재작성 | B2 |
| `app/api/custom-games/[id]/route.ts` | 수정 + PATCH 신규 | B2 |
| `app/api/custom-games/[id]/join/route.ts` | 신규 (POST/DELETE) | B2 |
| `app/api/custom-games/[id]/participants/[participantId]/route.ts` | 신규 (강퇴) | B2 |
| `app/api/custom-games/[id]/end|rounds|teams|guests|guests/[guestId]` | 권한 교체 + game_kind 가드 + capacity | B1,B2 |
| `lib/customGames/authorize.ts` | 신규 (`canManageGame`, `getViewerMember`) | B2 |
| `lib/customGames/waitlist.ts` | 신규 (`splitParticipants`) | B2 |
| `lib/customGames/constants.ts` | 신규 | B2 |
| `app/custom-games/page.tsx` | 대폭 수정 | B3 |
| `app/custom-games/[id]/page.tsx` | 대폭 수정 | B3 |
| `app/page.tsx` | 소폭 (모집 중 n건) | B3 |
| `CLAUDE.md` | 수정 | B3 |

### A — 다중 계정
`scripts/sql/20260725_riot_accounts.sql`(신규), `types/supabase.ts`, `lib/sync/doSyncMember.ts`(핵심 개편), `syncMember.ts`, `app/api/me/member/route.ts`, `app/api/me/riot-accounts/*`(신규), `lib/members/memberInput.ts`, `app/profile/*`, `app/api/admin/members/*`(CHILD_TABLES에 riot_accounts), `app/admin/members/*`, `MemberDetailPanel.tsx`(A3), `custom-games/[id]/rounds`(A3).
`app/tft/*`, `app/lol/*`, `app/steam/*`, `app/page.tsx`, `hall-of-fame/*`는 캐시 컬럼 덕에 **무변경**.

---

## 7. 위험 요소

| # | 위험 | 심각도 | 완화 |
|---|---|---|---|
| **B-R1** | **현재 로그인한 누구나 남의 내전 삭제/종료/강퇴 가능** | **최상(실존)** | B1 즉시 배포 |
| **B-R2** | `canManageGame`에서 `host_member_id`가 null인데 `viewerMemberId`도 null → `null===null` 통과 | **최상** | 헬퍼에 `!== null` 명시 |
| **B-R3** | 주최자 판정을 클라이언트 body로 받음 | **최상** | 세션 → members 조회로만 해석 |
| **B-R4** | 중복 신청 → 정원 왜곡 | 상 | 유니크 인덱스. 앱 로직으로 대체 불가 |
| **B-R5** | 승격 경합 | 상 → **설계로 제거** | B-3. Developer가 임의로 `status` 컬럼을 추가하면 보증이 깨진다 |
| **B-R6** | `game_kind`를 `game_type`에 합침 | 상 | 별도 컬럼 강제 |
| **B-R7** | 비-TFT 내전에 rounds POST → 엉뚱한 매치 기록 | 상 | 서버 400 가드 |
| **B-R8** | 타임존 — 클라에서 ISO 변환 | 중 | 서버 +09:00 고정 |
| **B-R9** | participants에 self-INSERT/DELETE RLS | **최상** | select만 |
| **B-R10** | 비관리자 모집 남용 | 중 | B-9의 4개 제한 |
| **B-R12** | 정원 하향으로 확정자가 대기 강등 | 하(UX) | 확인 다이얼로그 |
| **B-R13** | `custom-games/page.tsx`의 anon members 직접 조회 | 하 | 참가자 선택 UI와 함께 제거 |
| **A-R1** | 대표 전환으로 승인 우회 | **최상** | pending 복귀 |
| **A-R2** | riot_accounts self-UPDATE RLS | **최상** | select만 |
| **A-R6** | `(match_id, member_id)` 삭제 키 | 중 | `(match_id, puuid)` upsert |
| **A-R11** | CHILD_TABLES에 riot_accounts 누락 | 중 | A2 수용 기준 |

---

## 8. QA 검증 포인트

### B1
- [ ] 비관리자로 `DELETE /api/custom-games/{id}`, `POST .../end|rounds|teams|guests`, `DELETE .../guests/{gid}` → 전부 403
- [ ] 비관리자로 `POST /api/custom-games` → 200 (요구사항 회귀 방지)
- [ ] 비로그인 → 401 JSON

### B2 (핵심)
- [ ] 4종 게임 종류 생성. `etc` 라벨 없으면 400, 31자면 400
- [ ] `tft`+`team` → capacity 8 강제
- [ ] 과거 날짜 400, 91일 후 400, 활성 4번째 400
- [ ] `pending` 멤버 생성/참가 → 403
- [ ] 정원 4에 6명 신청 → confirmed 4 / waitlist 2, 순번 일치
- [ ] confirmed 2번 취소 → 대기 1번 자동 승격
- [ ] **동시성 1**: confirmed 2명 동시 취소 → 대기 2명 정확히 승격, 확정 4
- [ ] **동시성 2**: 취소 + 신규 신청 동시 → 확정 4, 중복/누락 없음
- [ ] **동시성 3**: 같은 사용자 더블클릭 → 1건 성공, 나머지 409, 행 1개
- [ ] **동시성 4**: 정원 4에 8명 동시 신청 → 확정 정확히 4, 순번 중복 없음
- [ ] 비권한자 강퇴 → 403, 대상 행 무변경
- [ ] 주최자 자기 강퇴 → 400
- [ ] PATCH로 `host_member_id` 이전 시도 → 무시(화이트리스트)
- [ ] body에 위조 `member_id`로 join → 세션 사용자로만 등록
- [ ] `game_kind='lol'`에 rounds POST → 400, `findCommonMatch` 미호출
- [ ] `game_kind='tft'`는 기존 플로우 회귀 없음
- [ ] 정원 6→3 강등 / 3→6 승격 정상
- [ ] anon 키로 participants INSERT/DELETE → RLS 거부

### B3
- [ ] 모집 폼 4항목, `기타`일 때만 라벨 노출
- [ ] `3/8` 인원, 대기 배지, KST 일정(브라우저 타임존 변경해도 동일)
- [ ] 버튼이 `참가 신청 / 대기 신청 / 참가 취소`로 정확히 전환
- [ ] 비-TFT 상세에 라운드/팀/게스트 미노출
- [ ] 비권한자에게 버튼 미노출 + API 직접 호출도 403

### A2/A3
- [ ] `count(members)` == `count(riot_accounts where is_primary)`
- [ ] 4번째 계정 트리거 거부, 동시 요청으로도 3개 초과 불가
- [ ] 타인 계정 DELETE 403, 중복 Riot ID 409
- [ ] **대표 전환 시 pending 복귀**
- [ ] 대표 계정 삭제 거부, 미러링 일치, 추방 시 riot_accounts 0건
- [ ] 부계정 2개가 같은 매치 참여 → 2행 보존

### 공통
- [ ] SQL 먼저 → 배포 나중
- [ ] service role이 Client Component에 import되지 않음
- [ ] `tsc` / `lint` / `build` 통과, `any` 0건
