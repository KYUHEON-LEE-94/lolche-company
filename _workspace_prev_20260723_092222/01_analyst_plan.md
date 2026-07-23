# 분석 결과 — 멤버 자가 등록/승인/추방 기능

## 작업 요약
로그인 사용자가 자기 Riot ID를 직접 등록·수정(pending 상태)하고, 관리자가 `/admin/members/control`에서 승인/거절/완전삭제 및 Discord 로그인 연결 현황을 관리하는 기능. `members`에 `status`/`user_id` 기반 워크플로 컬럼을 추가하고, 자가 등록 API는 반드시 서버에서 `user_id` 대조로 소유권을 검증한다.

---

## 0. 사전 확인 필수 (코드로 확정 불가 — DB에서 직접 확인)

```sql
-- (1) members를 참조하는 모든 FK와 ON DELETE 동작
select con.conname, rel.relname as referencing_table, pg_get_constraintdef(con.oid) as definition
  from pg_constraint con join pg_class rel on rel.oid = con.conrelid
 where con.contype = 'f' and con.confrelid = 'public.members'::regclass;

-- (2) members RLS 정책 전체 (가장 중요)
select polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
  from pg_policy where polrelid = 'public.members'::regclass;
select relrowsecurity from pg_class where oid = 'public.members'::regclass;

-- (3) hall_of_fame 실제 컬럼 (types/supabase.ts에 queue_type 누락)
select column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and table_name='hall_of_fame';
```

### 코드에서 확인된 `members.id` 참조 테이블 (컬럼 존재 확정, FK/ON DELETE 미확정)

| 테이블 | 참조 컬럼 | 근거 | 삭제 시 영향 |
|---|---|---|---|
| `tft_match_participants` | `member_id` (nullable) | `types/supabase.ts:70-80` | 현재 DELETE API가 수동 선삭제 (`app/api/admin/members/[id]/route.ts:31-38`) |
| `hall_of_fame` | `member_id` (nullable) | `types/supabase.ts:106-114` | ⚠ 과거 시즌 기록 소실 위험 |
| `member_rank_history` | `member_id` (**not null**) | `types/supabase.ts:116-127` | CASCADE 없으면 삭제 실패 |
| `sync_logs` | `member_id` (nullable) | `types/supabase.ts:129-137` | 감사 로그 소실 |
| `custom_game_participants` | `member_id` (not null) | `types/supabase.ts:152-157` | 내전 참가 기록 |
| `custom_game_teams` | `member_id` (nullable) | `types/supabase.ts:141-149` | 내전 팀 배정 |
| `custom_game_results` | `member_id` (not null) | `types/supabase.ts:166-172` | 내전 결과 |

### 명예의 전당 부수 피해 판정
`app/hall-of-fame/page.tsx:33`이 `select('*, members(member_name, profile_image_path)')`로 members 조인에 의존:
- CASCADE → 과거 시즌 순위 영구 소실
- SET NULL → 행은 남지만 이름 미표시 / 렌더 크래시 가능
- NO ACTION(기본) → members DELETE 자체가 23503으로 실패 → 추방 기능 동작 불가

### A안 (권장): hall_of_fame 이름 스냅샷 + FK를 SET NULL
```sql
alter table public.hall_of_fame
  add column if not exists member_name_snapshot text,
  add column if not exists profile_image_snapshot text;

update public.hall_of_fame h
   set member_name_snapshot = m.member_name,
       profile_image_snapshot = m.profile_image_path
  from public.members m
 where h.member_id = m.id and h.member_name_snapshot is null;

alter table public.hall_of_fame drop constraint if exists hall_of_fame_member_id_fkey;
alter table public.hall_of_fame add constraint hall_of_fame_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;
```
→ `lib/actions/season-actions.ts:32-40` archivePayload에 스냅샷 컬럼 추가
→ `app/hall-of-fame/page.tsx`, `_components/Podium.tsx`, `SeasonTab.tsx`에서 `members?.member_name ?? member_name_snapshot` fallback

### B안: 나머지 참조 테이블 FK 정리
```sql
alter table public.member_rank_history drop constraint if exists member_rank_history_member_id_fkey;
alter table public.member_rank_history add constraint member_rank_history_member_id_fkey
  foreign key (member_id) references public.members(id) on delete cascade;

alter table public.tft_match_participants drop constraint if exists tft_match_participants_member_id_fkey;
alter table public.tft_match_participants add constraint tft_match_participants_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

alter table public.sync_logs drop constraint if exists sync_logs_member_id_fkey;
alter table public.sync_logs add constraint sync_logs_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

alter table public.custom_game_participants drop constraint if exists custom_game_participants_member_id_fkey;
alter table public.custom_game_participants add constraint custom_game_participants_member_id_fkey
  foreign key (member_id) references public.members(id) on delete cascade;
alter table public.custom_game_results drop constraint if exists custom_game_results_member_id_fkey;
alter table public.custom_game_results add constraint custom_game_results_member_id_fkey
  foreign key (member_id) references public.members(id) on delete cascade;
alter table public.custom_game_teams drop constraint if exists custom_game_teams_member_id_fkey;
alter table public.custom_game_teams add constraint custom_game_teams_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;
```

**최종 부수 피해 (A+B 적용 후):**
- 보존: 명예의 전당 시즌 순위(이름 스냅샷), tft_matches 원본, sync_logs
- 소실: 랭크 히스토리 그래프, 내전 참가/결과, 해당 멤버의 매치 참가자 링크
- 되돌릴 수 없음 → UI에서 멤버명 재입력 확인 필수

---

## 1. DB 마이그레이션 — `scripts/sql/20260723_member_self_registration.sql`

```sql
-- STEP 1. 멤버 승인 상태
alter table public.members
  add column if not exists status text not null default 'approved',
  add column if not exists requested_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid,
  add column if not exists rejected_reason text;

alter table public.members drop constraint if exists members_status_check;
alter table public.members add constraint members_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists members_status_idx on public.members (status);
update public.members set status = 'approved' where status is null;

-- STEP 2. (선택) Riot ID 중복 등록 방지
create unique index if not exists members_riot_id_key
  on public.members (lower(riot_game_name), lower(riot_tagline));
```
> STEP 2는 기존 중복 데이터가 있으면 실패. 먼저 확인:
> `select lower(riot_game_name), lower(riot_tagline), count(*) from public.members group by 1,2 having count(*)>1;`

**RLS 대응 (사전 확인 (2) 결과에 따라):**
`app/api/profile/image/route.ts:27-30`, `frame/route.ts:19-22,54-57`이 anon 클라이언트 + 사용자 세션으로 members를 UPDATE → `user_id = auth.uid()` UPDATE 정책이 존재할 가능성 높음. 컬럼 제한 없이 걸려 있으면 **사용자가 콘솔에서 자기 status를 approved로 변경 가능.**
```sql
drop policy if exists "members self update" on public.members;  -- 실제 정책명으로 치환
```
그리고 profile image/frame 라우트를 `supabaseService` + `.eq('user_id', user.id)`로 전환. 컬럼 단위 RLS는 표현 불가하므로 "정책 제거 + 서버 경유"가 유일하게 확실한 방법.

---

## 2. 영향 파일 목록

| 파일 경로 | 변경 유형 | 이유 |
|---|---|---|
| `scripts/sql/20260723_member_self_registration.sql` | 신규 | status 컬럼 + FK 재정의 + hall_of_fame 스냅샷 |
| `types/supabase.ts` | 수정 | Member에 status 계열 추가, HallOfFame에 queue_type(누락) + 스냅샷 |
| `app/api/me/member/route.ts` | 신규 | GET 내 멤버 조회 / POST 자가 등록·수정 |
| `app/api/admin/members/[id]/approve/route.ts` | 신규 | 승인 + 동기화 트리거 |
| `app/api/admin/members/[id]/reject/route.ts` | 신규 | 거절 + 사유 |
| `app/api/admin/members/[id]/route.ts` | 수정 | DELETE 확인 강화 |
| `app/api/admin/members/route.ts` | 신규 | 관리자용 멤버 목록 |
| `app/api/admin/members/create/route.ts` | 수정 | `status:'approved'` 명시 |
| `app/profile/page.tsx` | 수정 | 자가 등록 폼 + status 분기 |
| `app/profile/MemberSelfForm.tsx` | 신규 | Riot ID 등록/수정 폼 |
| `app/admin/members/control/page.tsx` | 수정 | 대기 탭 + 연결 현황 + 삭제 확인 강화 |
| `app/page.tsx` | 수정 | `.eq('status','approved')` |
| `app/custom-games/page.tsx` | 수정 | 동일 필터 |
| `app/api/members/[id]/sync/route.ts` | 수정 | ⚠ 인증 부재 — 소유자 또는 관리자만 |
| `app/api/profile/image|frame/route.ts` | 수정 | service role 경유 전환 |
| `lib/actions/season-actions.ts` | 수정 | archive 시 스냅샷 저장 |
| `app/hall-of-fame/*` | 수정 | 스냅샷 fallback |
| `app/admin/AdminLayoutShell.tsx` | 삭제 검토 | 죽은 코드 |
| `CLAUDE.md` | 수정 | 문서화 |

---

## 3. 구현 계획

### Phase 1 — DB & 타입
1. 사전 확인 SQL 3종 실행 → FK 실제 정의 기록, A안/B안 확정
2. 마이그레이션 SQL 작성 (status → 스냅샷 → FK 순)
3. `types/supabase.ts` 갱신, `MemberStatus = 'pending'|'approved'|'rejected'` export

### Phase 2 — 자가 등록 API
4. `GET /api/me/member`: 미로그인 401. `user_id` 조회, 없으면 `getDiscordId(user)`로 discord_id 매칭도 시도
5. `POST /api/me/member`:
   - 입력 검증: member_name ≤50, riot_game_name ≤30, riot_tagline ≤10, trim 후 빈값 거부. tagline `/^[A-Za-z0-9]{2,10}$/`
   - **소유권: body의 `id`를 절대 신뢰하지 않고 `user_id = user.id`로만 대상 특정**
   - 신규: `status:'pending'`, `user_id`, `discord_id`, `requested_at`
   - 수정: **status/approved_by/approved_at/riot_puuid/랭크 컬럼은 페이로드에서 받지 않음** (3개 컬럼 화이트리스트)
   - rejected 행 수정 시 pending으로 복귀
6. **재승인 정책:** 승인된 멤버가 Riot ID 변경 시 pending으로 복귀(기본값). 이유: 타인의 상위 티어 계정으로 바꿔치기해 랭킹 조작 가능. 절충안(게임명만 변경 + 태그 동일이면 재승인 면제)은 상수 플래그로 분리

### Phase 3 — 관리자 API
7. `GET /api/admin/members`: requireAdmin → 필요한 컬럼만 select, `?status=pending` 지원. 로그인 여부는 `user_id is not null`로 판정
8. `POST .../approve`: requireAdmin → pending 확인 → approved + approved_at/by → **승인 직후 `syncOneMember` 직접 호출**(내부 fetch 금지). Riot 실패는 롤백 없이 경고. `revalidatePath('/')`
9. `POST .../reject`: requireAdmin → rejected + 사유(≤200자)
10. `DELETE [id]`: requireAdmin + body `confirmName`이 실제 member_name과 일치할 때만. `revalidatePath('/')`, `revalidatePath('/hall-of-fame')`

### Phase 4 — 사용자 UI
11. `app/profile/page.tsx` status 분기: 없음→등록폼 / pending→대기안내+수정 / rejected→사유+재신청 / approved→ProfileEditor + Riot ID 수정
12. `MemberSelfForm.tsx` (`'use client'`): maxLength 속성, catch 패턴 준수

### Phase 5 — 관리자 UI
13. `/admin/members/control` 통합 확장: `대기 중 (N)` / `전체 멤버` 탭, status 배지, 로그인 연결 배지, 삭제는 멤버명 타이핑 확인 모달 + 소실 데이터 명시. 데이터 소스를 `/api/admin/members`로 교체
14. `app/admin/layout.tsx` 대기 건수 배지(선택)

### Phase 6 — 노출 필터 & 보안 마감
15. `app/page.tsx:12`에 `.eq('status','approved')` — pending 차단 핵심 지점
16. `app/custom-games/page.tsx:95` 동일 필터
17. `app/api/members/[id]/sync/route.ts` 인증 추가 — 현재 완전 무인증(레이트리밋 소진 벡터). requireAdmin OR 본인 소유
18. profile image/frame 라우트 service role 전환
19. season-actions + hall-of-fame 스냅샷 반영
20. `npm run lint && npx tsc --noEmit && npm run build`
21. CLAUDE.md 갱신

---

## 4. 기존 관리자 CRUD 화면과의 관계

| 현재 | 제안 |
|---|---|
| `/admin/members/control` | **유지 + 확장.** 승인/거절 탭과 로그인 연결 현황을 흡수, 데이터 소스를 `/api/admin/members`로 교체 |
| `/admin/members/sync` | **유지.** 동기화 상태 모니터링 전용으로 좁힘 |
| 신규 `/admin/members/requests` | **만들지 않음.** control에 탭으로 흡수 |
| `app/admin/AdminLayoutShell.tsx` | 미사용 죽은 코드 — 삭제 권장 |

관리자 CRUD와 자가 등록은 권한 모델이 다르므로 API 분리 유지. 관리자 create는 `status='approved'` 즉시, 자가 등록은 항상 pending.

---

## 5. 위험 요소

| # | 심각도 | 내용 |
|---|---|---|
| R1 | 보안(치명) | members RLS에 컬럼 무제한 self-UPDATE 정책이 있으면 사용자가 자기 status를 approved로 변경 가능. 정책 제거 + 서버 경유가 필수 선행 |
| R2 | 보안(높음) | 자가 등록 API가 body의 `id`를 신뢰하면 타인 행 수정 가능 |
| R3 | 보안(높음) | `/api/members/[id]/sync` 무인증(기존 결함) → Riot 레이트리밋 고갈 |
| R4 | 보안(중) | Riot ID 무검증 변경 시 랭킹 조작 → 재승인 정책 |
| R5 | 데이터 소실(높음) | 멤버 삭제 시 hall_of_fame. CASCADE면 소실, NO ACTION이면 삭제 실패. A안 필수 |
| R6 | 기능(중) | `app/page.tsx`의 `.or(tft_tier...)`가 우연히 가려주지만 승인 전 동기화 시 pending 노출 |
| R7 | 정합(중) | `members_riot_id_key` 유니크 인덱스가 기존 중복으로 실패 가능 |
| R8 | 타입(낮음) | `HallOfFame.queue_type` 누락 — 코드는 사용 중 |
| R9 | 품질(낮음) | `ProfileEditor.tsx:39-44` auth.uid 출력 debug console.log |
| R10 | 품질(낮음) | `AdminLayoutShell.tsx` 죽은 코드 |
| R11 | 캐시(낮음) | `app/page.tsx` ISR 60초 → 승인 API에서 revalidatePath로 해소 |

---

## 6. 검증 포인트 (QA)

**자가 등록**
1. 미로그인 `POST /api/me/member` → 401
2. 신규 등록 → pending, user_id 자동, 홈 랭킹 미노출
3. body에 `status:'approved'`/`approved_by`/`riot_puuid`/`tft_tier` 섞어 전송 → 무시, pending 유지
4. body에 타인 member id → 자기 행만 영향, 타인 행 불변
5. 콘솔에서 `supabaseClient.from('members').update({status:'approved'})` 직접 실행 → **반드시 실패**
6. riot_game_name 31자 / riot_tagline 11자 / member_name 51자 → 각각 400
7. 공백만 입력 → 400
8. 승인된 멤버가 Riot ID 변경 → pending 복귀, 랭킹에서 제외

**관리자**
9. 비관리자로 approve/reject/DELETE/`GET /api/admin/members` → 전부 403
10. 승인 → approved + 자동 동기화 + 홈 즉시 반영
11. 존재하지 않는 Riot ID 승인 → 승인 성공 + 동기화 실패 메시지, 500 아님
12. 거절 → 사유 저장·표시, 재신청 가능
13. `user_id` 유무로 "로그인 연결됨/미로그인" 배지 정확히 구분
14. 다른 user_id가 연결된 discord_id 행을 콜백이 덮어쓰지 않음 (회귀)

**삭제**
15. 멤버명 오타 → 삭제 거부
16. 삭제 후 `/hall-of-fame` → 500 없이 스냅샷 이름으로 정상 렌더
17. 삭제 후 `/custom-games`, `/admin/members/sync`, `/` 에러 없음
18. 마이그레이션 전 `member_rank_history` not null FK 상태에서 삭제 시도 → 실패 확인

**회귀**
19. lint / tsc / build 전부 통과
20. 프로필 이미지·프레임 저장이 service role 전환 후 정상
21. `/api/members/[id]/sync` 비로그인 호출 → 401/403
