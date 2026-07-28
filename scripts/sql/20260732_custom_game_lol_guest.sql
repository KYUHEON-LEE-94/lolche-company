-- ============================================================================
-- 20260732_custom_game_lol_guest.sql
--   롤 내전 팀 슬롯에 외부인(자유 텍스트 라벨) 배정 지원.
--   실행 위치: Supabase 대시보드 → SQL Editor
--   ⚠ SQL 먼저 → 배포 나중.
--   전제: 20260731_custom_game_lol.sql 적용 완료
--
--   설계: 외부인은 "참가 신청자"가 아니라 배정 슬롯의 라벨이다(puuid·정원·승인 무관).
--         TFT 게스트(custom_game_guests, riot_puuid)와 완전히 분리된 개념이며,
--         라벨은 슬롯 자체(custom_game_teams.guest_name)에 둔다. FK 없음(순수 텍스트).
--         롤 배정 INSERT 는 guest_id(TFT puuid)를 절대 쓰지 않는다(항상 null).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0. 사전 확인 (읽기 전용) — identity CHECK 적용 가능 여부.
--   ★ 아래 카운트가 반드시 0 이어야 STEP 2 가 성공한다.
--     member_id·guest_id 둘 다 null 인 빈 슬롯 행이 하나라도 있으면 ALTER 실패한다.
--     0 이 아니면 그 행들을 먼저 정리하거나 STEP 2 를 "<= 1" 로 완화할 것.
-- ---------------------------------------------------------------------------
-- select count(*) from public.custom_game_teams
--  where ((member_id is not null)::int + (guest_id is not null)::int) <> 1;

-- ---------------------------------------------------------------------------
-- STEP 1. guest_name 컬럼 — 외부인 자유 텍스트 라벨. 길이 1~20.
--   기존 TFT 팀행·롤 member 배정행과 null 로 무해하게 공존한다.
-- ---------------------------------------------------------------------------
alter table public.custom_game_teams
  add column if not exists guest_name text;

alter table public.custom_game_teams drop constraint if exists custom_game_teams_guest_name_chk;
alter table public.custom_game_teams add constraint custom_game_teams_guest_name_chk
  check (guest_name is null or char_length(guest_name) between 1 and 20);

-- ---------------------------------------------------------------------------
-- STEP 2. 슬롯 정체성 — member_id / guest_id / guest_name 중 정확히 하나만 non-null.
--   ★ STEP 0 카운트가 0 일 때만 성공한다.
--   앱에서 member XOR guest_name 을 먼저 검증하고, 이 CHECK 가 최종 이중 방어다.
-- ---------------------------------------------------------------------------
alter table public.custom_game_teams drop constraint if exists custom_game_teams_identity_chk;
alter table public.custom_game_teams add constraint custom_game_teams_identity_chk
  check (
    (member_id is not null)::int
    + (guest_id is not null)::int
    + (guest_name is not null)::int
    = 1
  );

-- ---------------------------------------------------------------------------
-- STEP 3. 검증
-- ---------------------------------------------------------------------------
-- guest_name='홍길동' 만 있는 행 insert → 통과여야 한다
-- member_id + guest_name 동시 non-null → 23514 여야 한다
-- guest_name 21자 → 23514 여야 한다
--
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='custom_game_teams' and column_name='guest_name';

-- ---------------------------------------------------------------------------
-- 롤백 (필요 시에만. 배포된 코드를 먼저 이전 버전으로 되돌린 뒤 실행할 것)
-- ---------------------------------------------------------------------------
-- alter table public.custom_game_teams drop constraint if exists custom_game_teams_identity_chk;
-- alter table public.custom_game_teams drop constraint if exists custom_game_teams_guest_name_chk;
-- alter table public.custom_game_teams drop column if exists guest_name;
