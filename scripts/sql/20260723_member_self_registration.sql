-- ============================================================================
-- 멤버 자가 등록 / 승인 / 추방(완전 삭제) 마이그레이션
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- 주의: 이 파일은 자동 실행되지 않습니다. STEP 0부터 순서대로 직접 실행하세요.
--
-- 실행 순서 요약
--   STEP 0  사전 확인 (읽기 전용, 결과를 보고 STEP 4~5 적용 여부 판단)
--   STEP 1  members 승인 상태 컬럼 추가            ← 애플리케이션 코드가 요구함(필수)
--   STEP 2  기존 멤버 approved 백필                ← 필수
--   STEP 3  hall_of_fame 이름 스냅샷 컬럼 + 백필   ← 필수
--   STEP 4  members 참조 FK 재정의                 ← 필수(실측 결과 반영, 아래 참조)
--   STEP 5  members self-UPDATE RLS 정책 제거      ← 보안상 필수(실측으로 취약점 확인됨)
--
-- ✅ 2026-07-23 실측 완료 — STEP 0은 이미 수행했으며 결과는 다음과 같다.
--    · hall_of_fame_member_id_fkey 가 ON DELETE CASCADE 였다.
--      → 멤버를 SQL에서 직접 삭제하면 과거 시즌 기록이 영구 소실된다. STEP 4는 필수.
--    · members RLS 정책 2개 존재:
--        members_select_all  (SELECT, true)
--        members_update_own  (UPDATE, auth.uid() = user_id)  ← 컬럼 제한 없음 = 권한 상승 취약
--      → STEP 5는 필수.
--    · hall_of_fame 에 스냅샷 컬럼 없음, queue_type 은 NOT NULL.
--   STEP 6  (선택) Riot ID 중복 방지 유니크 인덱스
--   STEP 7  검증 쿼리
--
-- ⚠ STEP 1~3을 실행하기 전에 애플리케이션을 배포하면 다음 화면이 깨집니다.
--    - 홈(/), /custom-games : members.status 컬럼 참조
--    - /hall-of-fame        : member_name_snapshot 컬럼 참조
--   반드시 "SQL 먼저 → 배포 나중" 순서로 진행하세요.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- STEP 0. 사전 확인 (읽기 전용)
-- ---------------------------------------------------------------------------
-- 0-1) members를 참조하는 모든 FK와 ON DELETE 동작
-- select con.conname,
--        rel.relname as referencing_table,
--        pg_get_constraintdef(con.oid) as definition
--   from pg_constraint con
--   join pg_class rel on rel.oid = con.conrelid
--  where con.contype = 'f'
--    and con.confrelid = 'public.members'::regclass;

-- 0-2) members RLS 정책 전체 (STEP 5 판단에 사용 — 가장 중요)
-- select polname, polcmd,
--        pg_get_expr(polqual, polrelid)      as using_expr,
--        pg_get_expr(polwithcheck, polrelid) as with_check_expr
--   from pg_policy where polrelid = 'public.members'::regclass;
-- select relrowsecurity from pg_class where oid = 'public.members'::regclass;

-- 0-3) hall_of_fame 실제 컬럼 (types/supabase.ts에 queue_type이 누락되어 있었음)
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'hall_of_fame';

-- 0-4) STEP 6 적용 전 Riot ID 중복 여부
-- select lower(riot_game_name), lower(riot_tagline), count(*)
--   from public.members group by 1, 2 having count(*) > 1;


-- ---------------------------------------------------------------------------
-- STEP 1. members 승인 상태 컬럼 (필수)
--   default 'approved' 로 두는 이유: 기존 멤버가 마이그레이션 직후
--   홈 랭킹에서 일괄 사라지는 사고를 방지하기 위함.
--   자가 등록 API는 status를 명시적으로 'pending'으로 넣는다.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists status          text not null default 'approved',
  add column if not exists requested_at    timestamptz,
  add column if not exists approved_at     timestamptz,
  add column if not exists approved_by     uuid,
  add column if not exists rejected_reason text;

-- ⚠ CHECK 제약보다 백필이 먼저다.
--   status 컬럼이 이미(nullable 또는 값 없이) 존재했던 환경이라면 null/'' 행이 남아 있어
--   제약을 먼저 걸면 23514로 실패한다. 그래서 정규화를 선행한다.
update public.members set status = 'approved' where status is null or status = '';

alter table public.members drop constraint if exists members_status_check;
alter table public.members add constraint members_status_check
  check (status in ('pending', 'approved', 'rejected'));

create index if not exists members_status_idx on public.members (status);

-- 롤백:
--   alter table public.members drop constraint if exists members_status_check;
--   drop index if exists public.members_status_idx;
--   alter table public.members
--     drop column if exists status,
--     drop column if exists requested_at,
--     drop column if exists approved_at,
--     drop column if exists approved_by,
--     drop column if exists rejected_reason;


-- ---------------------------------------------------------------------------
-- STEP 2. 기존 멤버 approved 백필 재확인 (필수)
--   실제 백필은 CHECK 제약 때문에 STEP 1 안에서 이미 수행했다.
--   여기서는 멱등하게 한 번 더 돌려 잔여 행이 없음을 확인한다(정상이면 0 rows).
-- ---------------------------------------------------------------------------
update public.members set status = 'approved' where status is null or status = '';


-- ---------------------------------------------------------------------------
-- STEP 3. hall_of_fame 이름 스냅샷 (필수)
--   멤버 추방(완전 삭제) 시 과거 시즌 기록의 이름이 사라지지 않도록
--   기록 시점의 이름/이미지를 hall_of_fame 자체에 남긴다.
-- ---------------------------------------------------------------------------
alter table public.hall_of_fame
  add column if not exists member_name_snapshot   text,
  add column if not exists profile_image_snapshot text;

update public.hall_of_fame h
   set member_name_snapshot   = m.member_name,
       profile_image_snapshot = m.profile_image_path
  from public.members m
 where h.member_id = m.id
   and h.member_name_snapshot is null;

-- 롤백:
--   alter table public.hall_of_fame
--     drop column if exists member_name_snapshot,
--     drop column if exists profile_image_snapshot;


-- ---------------------------------------------------------------------------
-- STEP 4. members 참조 FK 재정의 (필수)
--
--   실측 결과 hall_of_fame_member_id_fkey 가 ON DELETE CASCADE 였다.
--   즉 현재 상태로 SQL 콘솔에서 멤버를 삭제하면 그 사람의 과거 시즌 명예의 전당
--   기록이 함께 사라진다. 애플리케이션 DELETE API는 자식 테이블을 코드에서
--   먼저 정리하므로 안전하지만, DB 차원의 안전망을 위해 SET NULL로 바꾼다.
--
--   아래 제약 이름은 2026-07-23 실측값과 일치함을 확인했다(7개 전부).
-- ---------------------------------------------------------------------------

-- hall_of_fame: 기록 보존이 목적 → SET NULL (STEP 3 스냅샷과 짝을 이룸)
alter table public.hall_of_fame drop constraint if exists hall_of_fame_member_id_fkey;
alter table public.hall_of_fame add constraint hall_of_fame_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

-- member_rank_history: member_id NOT NULL → CASCADE 외에 선택지가 없음
alter table public.member_rank_history drop constraint if exists member_rank_history_member_id_fkey;
alter table public.member_rank_history add constraint member_rank_history_member_id_fkey
  foreign key (member_id) references public.members(id) on delete cascade;

-- tft_match_participants: 매치 원본은 보존, 멤버 링크만 해제
alter table public.tft_match_participants drop constraint if exists tft_match_participants_member_id_fkey;
alter table public.tft_match_participants add constraint tft_match_participants_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

-- sync_logs: 감사 로그 보존
alter table public.sync_logs drop constraint if exists sync_logs_member_id_fkey;
alter table public.sync_logs add constraint sync_logs_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

-- 내전 테이블
alter table public.custom_game_participants drop constraint if exists custom_game_participants_member_id_fkey;
alter table public.custom_game_participants add constraint custom_game_participants_member_id_fkey
  foreign key (member_id) references public.members(id) on delete cascade;

alter table public.custom_game_results drop constraint if exists custom_game_results_member_id_fkey;
alter table public.custom_game_results add constraint custom_game_results_member_id_fkey
  foreign key (member_id) references public.members(id) on delete cascade;

alter table public.custom_game_teams drop constraint if exists custom_game_teams_member_id_fkey;
alter table public.custom_game_teams add constraint custom_game_teams_member_id_fkey
  foreign key (member_id) references public.members(id) on delete set null;

-- 롤백: 각 제약을 drop 후 on delete 절 없이(= NO ACTION) 다시 add 하면 원복됩니다.


-- ---------------------------------------------------------------------------
-- STEP 5. members self-UPDATE RLS 정책 제거 (보안상 필수)
--
--   배경: PostgreSQL RLS는 "행" 단위이지 "컬럼" 단위가 아닙니다.
--   members에 `user_id = auth.uid()` 조건의 UPDATE 정책이 걸려 있으면,
--   로그인 사용자가 브라우저 콘솔에서 다음을 실행해 스스로를 승인할 수 있습니다.
--     supabaseClient.from('members').update({ status: 'approved' }).eq('user_id', uid)
--
--   대응: 정책을 제거하고, 정당한 self-UPDATE(프로필 이미지/프레임, Riot ID 신청)는
--   전부 서버 라우트에서 service role로 수행하도록 코드를 이미 전환했습니다.
--     - app/api/profile/image/route.ts
--     - app/api/profile/frame/route.ts
--     - app/api/me/member/route.ts
--
--   ✅ 실측으로 확인된 정책 이름은 members_update_own 이다. 그대로 실행하면 된다.
--      (members_select_all 은 공개 랭킹 조회에 필요하므로 남겨둔다)
-- ---------------------------------------------------------------------------
drop policy if exists members_update_own on public.members;

-- 제거 후 재확인 (UPDATE 정책이 하나도 없어야 정상 — 0 rows)
-- select polname, polcmd from pg_policy
--  where polrelid = 'public.members'::regclass and polcmd = 'w';

-- 롤백(원복이 필요한 경우에만):
--   create policy members_update_own on public.members
--     for update to authenticated
--     using (auth.uid() = user_id) with check (auth.uid() = user_id);
--   ⚠ 원복하면 위 권한 상승 취약점이 되살아납니다. 권장하지 않습니다.


-- ---------------------------------------------------------------------------
-- STEP 6. (선택) Riot ID 중복 등록 방지
--   STEP 0-4에서 중복이 발견되면 먼저 정리한 뒤 실행하세요. 중복이 있으면 실패합니다.
-- ---------------------------------------------------------------------------
-- create unique index if not exists members_riot_id_key
--   on public.members (lower(riot_game_name), lower(riot_tagline));

-- 롤백: drop index if exists public.members_riot_id_key;


-- ---------------------------------------------------------------------------
-- STEP 7. 검증
-- ---------------------------------------------------------------------------
-- select status, count(*) from public.members group by status;
-- select member_name, status, user_id is not null as linked, requested_at
--   from public.members order by created_at desc limit 20;
-- select count(*) filter (where member_name_snapshot is null) as missing_snapshot
--   from public.hall_of_fame;
-- select con.conname, pg_get_constraintdef(con.oid)
--   from pg_constraint con
--  where con.contype = 'f' and con.confrelid = 'public.members'::regclass;
