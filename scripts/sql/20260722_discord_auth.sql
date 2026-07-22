-- ============================================================================
-- Discord OAuth 전환 마이그레이션
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- 주의: 이 파일은 자동 실행되지 않습니다. 아래 순서대로 직접 실행하세요.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0. (사전 확인) admins 테이블 현재 구조/제약 확인
--   결과를 보고 STEP 2의 (A)안 적용 여부를 판단합니다.
-- ---------------------------------------------------------------------------
-- select column_name, data_type, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'admins';
--
-- select con.conname, con.contype, pg_get_constraintdef(con.oid)
--   from pg_constraint con
--   join pg_class rel on rel.oid = con.conrelid
--   join pg_namespace ns on ns.oid = rel.relnamespace
--  where ns.nspname = 'public' and rel.relname = 'admins';
--
-- -- admins.user_id를 참조하는 외래키가 있는지 확인 (있으면 (A)안 적용 전 조정 필요)
-- select con.conname, rel.relname as referencing_table, pg_get_constraintdef(con.oid)
--   from pg_constraint con
--   join pg_class rel on rel.oid = con.conrelid
--  where con.contype = 'f'
--    and con.confrelid = 'public.admins'::regclass;


-- ---------------------------------------------------------------------------
-- STEP 1. discord_id 컬럼 및 유니크 인덱스 추가
-- ---------------------------------------------------------------------------
alter table public.members add column if not exists user_id uuid;
alter table public.members add column if not exists discord_id text;

create unique index if not exists members_discord_id_key
  on public.members (discord_id) where discord_id is not null;

create unique index if not exists members_user_id_key
  on public.members (user_id) where user_id is not null;

alter table public.admins add column if not exists discord_id text;

create unique index if not exists admins_discord_id_key
  on public.admins (discord_id) where discord_id is not null;


-- ---------------------------------------------------------------------------
-- STEP 2. (A)안 — 권장 / 기본안
--   admins.user_id가 PK 또는 NOT NULL이면, Discord 첫 로그인 "전"에
--   discord_id만으로 관리자를 사전 등록할 수 없습니다.
--   대리 PK(id)를 도입하고 user_id를 nullable로 바꿉니다.
--
--   ⚠ STEP 0에서 admins.user_id를 참조하는 FK가 발견되면
--     이 블록을 실행하기 전에 해당 FK를 먼저 조정하세요.
--   ⚠ 이미 id 대리 PK가 있고 user_id가 nullable이면 STEP 2는 건너뛰어도 됩니다.
-- ---------------------------------------------------------------------------
alter table public.admins add column if not exists id uuid default gen_random_uuid();
update public.admins set id = gen_random_uuid() where id is null;
alter table public.admins alter column id set not null;

alter table public.admins drop constraint if exists admins_pkey;
alter table public.admins add primary key (id);

alter table public.admins alter column user_id drop not null;

-- user_id는 이제 PK가 아니므로 중복 방지를 위해 부분 유니크 인덱스로 보강
create unique index if not exists admins_user_id_key
  on public.admins (user_id) where user_id is not null;


-- ---------------------------------------------------------------------------
-- STEP 3. 기존 관리자/멤버에 Discord snowflake ID 주입
--   Discord 앱 → 설정 → 고급 → 개발자 모드 ON → 유저 우클릭 → "사용자 ID 복사"
--   ⚠ 이 단계를 건너뛰면 Discord 전환 후 모든 관리자가 잠깁니다. 반드시 먼저 수행하세요.
-- ---------------------------------------------------------------------------
-- update public.admins  set discord_id = '123456789012345678' where display_name = '관리자A';
-- update public.members set discord_id = '123456789012345678' where member_name  = '홍길동';

-- 신규 관리자 사전 등록 예시 ((A)안 적용 후에만 가능)
-- insert into public.admins (discord_id, display_name, is_super_admin)
-- values ('123456789012345678', '관리자B', false)
-- on conflict do nothing;


-- ---------------------------------------------------------------------------
-- STEP 4. (검증) 연결 상태 확인
-- ---------------------------------------------------------------------------
-- select display_name, discord_id, user_id from public.admins order by created_at;
-- select member_name, discord_id, user_id from public.members order by member_name;
