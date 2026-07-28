-- ============================================================================
-- 20260731_custom_game_lol.sql
--   내전 game_kind='lol' 지원: 증바람(aram)/협곡(rift) 모드 + 협곡 포지션 슬롯
--   실행 위치: Supabase 대시보드 → SQL Editor
--   ⚠ SQL 먼저 → 배포 나중.
--   전제: 20260725_custom_game_recruit.sql / 20260727_custom_game_steam.sql 적용 완료
--
--   범위: 모집 + 팀/포지션 배치까지. 매치 결과 자동 수집·순위 기록은 하지 않는다.
--   설계: lol_mode 는 game_kind 와 직교하는 신규 컬럼(steam_app_id 가 steam 전용
--         CHECK 로 강제되는 것과 동일 패턴). game_type 은 TFT 전용으로 남긴다.
-- ============================================================================

-- STEP 0. 사전 확인 (읽기 전용)
-- select conname from pg_constraint
--  where conrelid = 'public.custom_games'::regclass and contype = 'c';
-- select game_kind, count(*) from public.custom_games group by 1;
-- select count(*) from public.custom_game_teams;

-- ---------------------------------------------------------------------------
-- STEP 1. lol_mode 컬럼 — game_kind='lol' 일 때만 존재
--   증바람/협곡 둘 다 5:5 팀 분할. 값은 'aram' | 'rift'.
--   game_kind<>'lol' 이면 반드시 null (steam_app_id 패턴과 동일).
-- ---------------------------------------------------------------------------
alter table public.custom_games
  add column if not exists lol_mode text;

alter table public.custom_games drop constraint if exists custom_games_lol_mode_chk;
alter table public.custom_games add constraint custom_games_lol_mode_chk
  check (
    (game_kind = 'lol' and lol_mode in ('aram', 'rift'))
    or (game_kind <> 'lol' and lol_mode is null)
  );

-- ---------------------------------------------------------------------------
-- STEP 2. custom_game_teams.position — 협곡 포지션 슬롯. 증바람=null.
--   기존 TFT 팀전(4팀×2)은 position 을 쓰지 않으므로 null 로 무해하게 공존한다.
-- ---------------------------------------------------------------------------
alter table public.custom_game_teams
  add column if not exists position text;

alter table public.custom_game_teams drop constraint if exists custom_game_teams_position_chk;
alter table public.custom_game_teams add constraint custom_game_teams_position_chk
  check (position is null or position in ('top', 'jungle', 'mid', 'adc', 'support'));

-- ---------------------------------------------------------------------------
-- STEP 3. 협곡 포지션 중복 방지 — position not null 일 때만.
--   같은 게임·라운드·팀에서 같은 포지션이 두 번 배정되는 것을 DB 가 막는다.
--   증바람(position=null)은 partial index 에서 빠지므로 영향 없다.
-- ---------------------------------------------------------------------------
create unique index if not exists custom_game_teams_position_uniq
  on public.custom_game_teams(custom_game_id, round_number, team_index, position)
  where position is not null;

-- ---------------------------------------------------------------------------
-- STEP 4. 검증
-- ---------------------------------------------------------------------------
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='custom_games' and column_name='lol_mode';
-- select column_name, data_type from information_schema.columns
--  where table_schema='public' and table_name='custom_game_teams' and column_name='position';
--
-- update public.custom_games set lol_mode='aram' where game_kind='tft';   -- 23514 여야 한다
-- update public.custom_game_teams set position='wrong' where false;       -- (형식) 23514 여야 한다

-- ---------------------------------------------------------------------------
-- 롤백 (필요 시에만. 배포된 코드를 먼저 이전 버전으로 되돌린 뒤 실행할 것)
-- ---------------------------------------------------------------------------
-- drop index if exists public.custom_game_teams_position_uniq;
-- alter table public.custom_game_teams drop constraint if exists custom_game_teams_position_chk;
-- alter table public.custom_game_teams drop column if exists position;
-- alter table public.custom_games drop constraint if exists custom_games_lol_mode_chk;
-- alter table public.custom_games drop column if exists lol_mode;
