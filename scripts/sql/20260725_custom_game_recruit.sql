-- =====================================================================
-- 20260725_custom_game_recruit.sql
-- Phase B2 — 내전 모집/참가/대기열 스키마
--
-- 실행 순서: 이 SQL을 Supabase SQL Editor에서 먼저 실행한 뒤 코드를 배포한다.
-- 미실행 상태에서 코드가 배포되면 신규 컬럼 조회가 42703으로 실패하며,
-- 앱은 500이 아니라 503 + "마이그레이션 미적용" 안내로 degrade한다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 0. 사전 확인 (읽기 전용 — 실행 결과를 눈으로 확인하고 STEP 1로 넘어갈 것)
-- ---------------------------------------------------------------------
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public'
--    and table_name in ('custom_games', 'custom_game_participants')
--  order by table_name, ordinal_position;
--
-- select distinct status from public.custom_games;
-- select count(*) from public.custom_games;              -- 2026-07-23 실측: 0
-- select count(*) from public.custom_game_participants;  -- 2026-07-23 실측: 0
--
-- -- STEP 2의 유니크 인덱스 사전 검사 (0행이어야 한다)
-- select custom_game_id, member_id, count(*)
--   from public.custom_game_participants
--  group by 1, 2
-- having count(*) > 1;


-- ---------------------------------------------------------------------
-- STEP 1. custom_games 모집 컬럼
-- ---------------------------------------------------------------------

-- [설계 판단] host_member_id는 nullable + on delete set null 을 유지한다.
--
-- 데이터가 0건이므로 NOT NULL 자체는 가능하지만, NOT NULL은 FK의
-- on delete set null 과 충돌하므로 on delete cascade 를 강제한다.
-- 그렇게 하면 멤버 1명을 추방하는 순간 그 사람이 주최한 내전 전체가
-- (참가자·라운드·결과 기록까지) 함께 사라진다. 내전 기록은 주최자 개인의
-- 자료가 아니라 참가자 전원의 공용 기록이므로, hall_of_fame이
-- member_id=null + 이름 스냅샷으로 기록을 보존하는 것과 같은 이유로
-- 여기서도 "주최자만 사라지고 내전은 남는" 쪽을 택한다.
--
-- 대신 nullable로 남는 null 주최자 때문에 생기는 권한 우회
-- (host_member_id is null 인 내전을 members 미연결 사용자가 자기 것으로 오인)는
-- lib/customGames/authorize.ts 의 canManageGame() 이
--   isAdmin || (game.host_member_id !== null && game.host_member_id === viewerMemberId)
-- 로 명시적으로 차단한다. null === null 통과 경로는 코드에 존재하지 않는다.
-- 신규 생성 시 host_member_id는 서버가 세션 → members 조회로만 채우므로
-- 정상 경로에서 null이 되는 일은 없다(추방으로 사후에 null이 될 뿐이다).

alter table public.custom_games
  add column if not exists host_member_id  uuid references public.members(id) on delete set null,
  add column if not exists game_kind       text not null default 'tft',
  add column if not exists game_kind_label text,
  add column if not exists scheduled_at    timestamptz,
  add column if not exists capacity        int not null default 8;

alter table public.custom_games drop constraint if exists custom_games_game_kind_chk;
alter table public.custom_games add constraint custom_games_game_kind_chk
  check (game_kind in ('tft', 'lol', 'steam', 'etc'));

-- 'etc' ↔ 라벨 존재를 양방향으로 강제한다.
alter table public.custom_games drop constraint if exists custom_games_game_kind_label_chk;
alter table public.custom_games add constraint custom_games_game_kind_label_chk
  check (
    (game_kind = 'etc'
      and game_kind_label is not null
      and length(btrim(game_kind_label)) between 1 and 30)
    or (game_kind <> 'etc' and game_kind_label is null)
  );

alter table public.custom_games drop constraint if exists custom_games_capacity_chk;
alter table public.custom_games add constraint custom_games_capacity_chk
  check (capacity between 2 and 100);

alter table public.custom_games drop constraint if exists custom_games_title_chk;
alter table public.custom_games add constraint custom_games_title_chk
  check (length(btrim(title)) between 1 and 60);

-- 기존 데이터가 0건이므로 status CHECK를 안전하게 추가할 수 있다.
alter table public.custom_games drop constraint if exists custom_games_status_chk;
alter table public.custom_games add constraint custom_games_status_chk
  check (status in ('recruiting', 'in_progress', 'ended', 'cancelled'));


-- ---------------------------------------------------------------------
-- STEP 2. 인덱스
-- ---------------------------------------------------------------------

create index if not exists custom_games_host_idx
  on public.custom_games(host_member_id)
  where host_member_id is not null;

create index if not exists custom_games_schedule_idx
  on public.custom_games(scheduled_at desc nulls last);

-- 주최자당 활성 모집글 3개 제한 카운트용
create index if not exists custom_games_host_active_idx
  on public.custom_games(host_member_id, status)
  where status in ('recruiting', 'in_progress');

-- ★ custom_game_participants 에 status('confirmed'|'waitlisted') 컬럼을 만들지 말 것.
--   물리 컬럼으로 저장하면 취소마다 승격 UPDATE가 필요해지고, 동시 취소 2건이
--   같은 대기자를 중복 승격하거나 아무도 승격하지 못하는 경합이 생긴다(앱 코드로 못 막는다).
--   대신 (joined_at, id) 정렬 상위 capacity명을 확정으로 "파생"한다.
--   → 취소 = DELETE 1건. 승격 로직이 존재하지 않으므로 승격 경합도 존재하지 않는다.
create index if not exists custom_game_participants_order_idx
  on public.custom_game_participants(custom_game_id, joined_at, id);

-- ★ 중복 신청 차단은 앱의 select→insert 로는 불가능하다(더블클릭·동시요청에 반드시 뚫린다).
--   유니크 인덱스가 유일한 방어선이며, 코드는 23505를 409로 매핑한다.
create unique index if not exists custom_game_participants_uniq
  on public.custom_game_participants(custom_game_id, member_id);


-- ---------------------------------------------------------------------
-- STEP 3. RLS — select 정책만. insert/update/delete 정책 금지
-- ---------------------------------------------------------------------
-- ★ custom_game_participants 에 self-INSERT/DELETE 정책을 만들면 사용자가
--   콘솔에서 joined_at 을 조작해 대기열을 새치기하거나 정원/승인 검증을
--   우회할 수 있다(members_update_own 사고와 동일 구조).
--   정당한 참가/취소는 전부 서버 라우트에서 service role 로 수행한다.

alter table public.custom_games enable row level security;
drop policy if exists custom_games_select_all on public.custom_games;
create policy custom_games_select_all
  on public.custom_games for select using (true);

alter table public.custom_game_participants enable row level security;
drop policy if exists custom_game_participants_select_all on public.custom_game_participants;
create policy custom_game_participants_select_all
  on public.custom_game_participants for select using (true);


-- ---------------------------------------------------------------------
-- STEP 4. 검증
-- ---------------------------------------------------------------------
-- select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'custom_games'
--    and column_name in ('host_member_id','game_kind','game_kind_label','scheduled_at','capacity');
--   -- 5행이 나와야 한다
--
-- select conname from pg_constraint
--  where conrelid = 'public.custom_games'::regclass and contype = 'c';
--   -- custom_games_game_kind_chk / _game_kind_label_chk / _capacity_chk / _title_chk / _status_chk
--
-- select indexname from pg_indexes
--  where schemaname = 'public' and tablename = 'custom_game_participants';
--   -- custom_game_participants_order_idx, custom_game_participants_uniq 포함
--
-- select tablename, policyname, cmd from pg_policies
--  where schemaname = 'public' and tablename in ('custom_games','custom_game_participants');
--   -- cmd 가 SELECT 인 정책만 존재해야 한다


-- ---------------------------------------------------------------------
-- 롤백 (필요 시에만. 배포된 코드를 먼저 이전 버전으로 되돌린 뒤 실행할 것)
-- ---------------------------------------------------------------------
-- drop index if exists public.custom_game_participants_uniq;
-- drop index if exists public.custom_game_participants_order_idx;
-- drop index if exists public.custom_games_host_active_idx;
-- drop index if exists public.custom_games_schedule_idx;
-- drop index if exists public.custom_games_host_idx;
--
-- alter table public.custom_games drop constraint if exists custom_games_status_chk;
-- alter table public.custom_games drop constraint if exists custom_games_title_chk;
-- alter table public.custom_games drop constraint if exists custom_games_capacity_chk;
-- alter table public.custom_games drop constraint if exists custom_games_game_kind_label_chk;
-- alter table public.custom_games drop constraint if exists custom_games_game_kind_chk;
--
-- alter table public.custom_games
--   drop column if exists capacity,
--   drop column if exists scheduled_at,
--   drop column if exists game_kind_label,
--   drop column if exists game_kind,
--   drop column if exists host_member_id;
--
-- drop policy if exists custom_games_select_all on public.custom_games;
-- drop policy if exists custom_game_participants_select_all on public.custom_game_participants;
