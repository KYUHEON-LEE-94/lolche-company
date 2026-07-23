-- ============================================================================
-- 20260727_custom_game_steam.sql
--   내전 game_kind='steam' 에 게임명 + steam appid 저장
--   실행 위치: Supabase 대시보드 → SQL Editor
--   ⚠ SQL 먼저 → 배포 나중.
--   전제: 20260725_custom_game_recruit.sql / 20260724_steam.sql 적용 완료
-- ============================================================================

-- STEP 0. 사전 확인 (읽기 전용)
-- select conname from pg_constraint
--  where conrelid='public.custom_games'::regclass and contype='c';
-- select game_kind, count(*) from public.custom_games group by 1;

-- ---------------------------------------------------------------------------
-- STEP 1. steam_app_id 컬럼
--   ⚠ steam_apps(appid) 로 FK 를 걸지 않는다.
--     아직 백필되지 않은 앱 때문에 내전 생성이 실패하면 안 된다.
--     캡슐 이미지 표시용 비정규화 스냅샷이고, 이름은 game_kind_label 에 따로 남는다.
-- ---------------------------------------------------------------------------
alter table public.custom_games
  add column if not exists steam_app_id int;

-- ---------------------------------------------------------------------------
-- STEP 2. game_kind_label CHECK 완화 — 'etc' 전용 → 'etc' | 'steam'
--   steam 은 라벨을 "선택적"으로 둔다(게임 미정 상태의 모집 허용).
--   etc 는 기존대로 라벨 필수 유지.
-- ---------------------------------------------------------------------------
alter table public.custom_games drop constraint if exists custom_games_game_kind_label_chk;
alter table public.custom_games add constraint custom_games_game_kind_label_chk
  check (
    (game_kind = 'etc'
      and game_kind_label is not null
      and length(btrim(game_kind_label)) between 1 and 30)
    or (game_kind = 'steam'
      and (game_kind_label is null
           or length(btrim(game_kind_label)) between 1 and 30))
    or (game_kind not in ('etc','steam') and game_kind_label is null)
  );

-- ---------------------------------------------------------------------------
-- STEP 3. steam_app_id 는 game_kind='steam' 일 때만 존재
-- ---------------------------------------------------------------------------
alter table public.custom_games drop constraint if exists custom_games_steam_app_id_chk;
alter table public.custom_games add constraint custom_games_steam_app_id_chk
  check (
    (game_kind = 'steam' and (steam_app_id is null or steam_app_id > 0))
    or (game_kind <> 'steam' and steam_app_id is null)
  );

-- ---------------------------------------------------------------------------
-- STEP 4. 게임 후보 RPC — DB 만 읽는다. Steam API 호출 없음.
--   ⚠ p_multiplayer_only = true 이면 is_multiplayer = false 인 앱만 제외한다.
--      null(분류 미확인)은 남긴다 — app/steam/page.tsx 의 기존 방침과 동일.
-- ---------------------------------------------------------------------------
create or replace function public.steam_game_options(
  p_query            text    default null,
  p_multiplayer_only boolean default true,
  p_limit            int     default 30
)
returns table (appid int, name text, owner_count bigint, is_multiplayer boolean)
language sql stable security definer set search_path = public
as $$
  select a.appid, a.name,
         count(distinct o.member_id) as owner_count,
         a.is_multiplayer
    from public.steam_owned_games o
    join public.steam_apps a on a.appid = o.appid
    join public.members    m on m.id    = o.member_id
   where m.status = 'approved'          -- 노출 필터 (CLAUDE.md)
     and m.steam_id64 is not null
     and (not coalesce(p_multiplayer_only, true) or a.is_multiplayer is distinct from false)
     and (p_query is null or length(btrim(p_query)) = 0
          or a.name ilike '%' || btrim(p_query) || '%')
   group by a.appid, a.name, a.is_multiplayer
   order by owner_count desc, a.name asc
   limit least(greatest(coalesce(p_limit, 30), 1), 100);
$$;

revoke all on function public.steam_game_options(text, boolean, int)
  from public, anon, authenticated;
-- 서버 라우트(service role)만 호출한다.

-- 검색 성능 (steam_apps 가 수만 건이 되면 필요. 그 미만이면 생략 가능)
create extension if not exists pg_trgm;
create index if not exists steam_apps_name_trgm_idx
  on public.steam_apps using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- STEP 5. 검증
-- ---------------------------------------------------------------------------
-- select * from public.steam_game_options(null, true, 10);
-- select * from public.steam_game_options('cs', true, 10);
-- update public.custom_games set steam_app_id = 730 where game_kind = 'tft';  -- 23514 여야 한다

-- 롤백:
--   drop function if exists public.steam_game_options(text, boolean, int);
--   drop index if exists public.steam_apps_name_trgm_idx;
--   alter table public.custom_games drop constraint if exists custom_games_steam_app_id_chk;
--   alter table public.custom_games drop column if exists steam_app_id;
--   -- game_kind_label CHECK 는 20260725 의 원본으로 복원
