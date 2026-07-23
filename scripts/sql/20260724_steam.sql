-- 20260724_steam.sql — 스팀 연동 (Phase 5)
--
-- 목적
--   1) members 에 스팀 프로필 캐시 컬럼 추가 (사용자가 직접 입력한 SteamID64)
--   2) steam_apps      — 앱 메타데이터 + 멀티플레이 여부 캐시 (앱당 1회만 조회, 영구 보관)
--   3) steam_owned_games — 멤버별 보유 게임/플레이타임 캐시 (/steam 은 이 테이블만 읽는다)
--
-- ⚠ 실행 방법: Supabase SQL Editor 에서 직접 실행. "SQL 먼저 → 배포 나중" 순서를 지킬 것.
--   (app/steam/page.tsx, app/api/me/steam, app/api/admin/sync-steam 이 아래 스키마를 참조한다)
--
-- ⚠ RLS 원칙: members 와 동일하게 select 정책만 만든다.
--   RLS 는 행 단위라 컬럼을 제한할 수 없어, insert/update/delete 정책을 두면
--   사용자가 콘솔에서 자기 플레이타임·보유 게임을 임의로 조작할 수 있다.
--   모든 쓰기는 서버 라우트에서 service role 로만 수행한다.


-- =====================================================================
-- STEP 1. members — 스팀 프로필 캐시 컬럼
-- =====================================================================
alter table public.members
  add column if not exists steam_id64       text,
  add column if not exists steam_persona    text,
  add column if not exists steam_avatar_url text,
  -- Steam GetPlayerSummaries 의 communityvisibilitystate 원값. 3 = 공개, 그 외 = 비공개
  add column if not exists steam_visibility int,
  add column if not exists steam_linked_at  timestamptz,
  add column if not exists steam_synced_at  timestamptz,
  add column if not exists steam_sync_error text;

-- 스팀 계정 소유권 증명을 하지 않으므로(사용자 결정), 선점만 유니크 인덱스로 차단한다.
create unique index if not exists members_steam_id64_uidx
  on public.members(steam_id64) where steam_id64 is not null;


-- =====================================================================
-- STEP 2. steam_apps — 앱 메타 + 멀티플레이 판정 캐시
-- =====================================================================
-- is_multiplayer 는 3-값이다:
--   true  = Multi-player(1) / Online Co-op(38) / PvP(49) 중 하나 이상 보유
--   false = 위 카테고리 없음 (싱글플레이)
--   null  = 아직 조회 안 했거나 store API 실패 → UI 에 "분류 미확인" 으로 표기
create table if not exists public.steam_apps (
  appid              int primary key,
  name               text,
  is_multiplayer     boolean,
  category_ids       int[],
  details_checked_at timestamptz,
  created_at         timestamptz not null default now()
);

-- 미확인 앱 백필 배치가 매번 스캔하는 조건
create index if not exists steam_apps_unchecked_idx
  on public.steam_apps(appid) where details_checked_at is null;


-- =====================================================================
-- STEP 3. steam_owned_games — 멤버별 보유 게임 캐시
-- =====================================================================
-- playtime_2weeks 는 GetOwnedGames 응답에 포함되므로 GetRecentlyPlayedGames 를 따로 부르지 않는다.
create table if not exists public.steam_owned_games (
  member_id        uuid not null references public.members(id) on delete cascade,
  appid            int  not null references public.steam_apps(appid) on delete cascade,
  playtime_forever int  not null default 0,   -- 분 단위
  playtime_2weeks  int  not null default 0,   -- 분 단위
  updated_at       timestamptz not null default now(),
  primary key (member_id, appid)
);

create index if not exists steam_owned_games_appid_idx
  on public.steam_owned_games(appid);
create index if not exists steam_owned_games_recent_idx
  on public.steam_owned_games(member_id) where playtime_2weeks > 0;


-- =====================================================================
-- STEP 4. RLS — select 만 공개. insert/update/delete 정책은 만들지 않는다.
-- =====================================================================
alter table public.steam_apps enable row level security;
drop policy if exists steam_apps_select_all on public.steam_apps;
create policy steam_apps_select_all on public.steam_apps for select using (true);

alter table public.steam_owned_games enable row level security;
drop policy if exists steam_owned_games_select_all on public.steam_owned_games;
create policy steam_owned_games_select_all on public.steam_owned_games for select using (true);
-- ⚠ update/insert/delete 정책 추가 금지 (위 RLS 원칙 참고)


-- =====================================================================
-- STEP 5. 검증 (읽기 전용)
-- =====================================================================
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='members' and column_name like 'steam_%';
-- select count(*) from public.steam_apps;
-- select count(*) from public.steam_owned_games;
-- select is_multiplayer, count(*) from public.steam_apps group by 1;


-- =====================================================================
-- 롤백 (필요 시에만, 데이터 소실 주의)
-- =====================================================================
-- drop table if exists public.steam_owned_games;
-- drop table if exists public.steam_apps;
-- drop index if exists public.members_steam_id64_uidx;
-- alter table public.members
--   drop column if exists steam_id64,
--   drop column if exists steam_persona,
--   drop column if exists steam_avatar_url,
--   drop column if exists steam_visibility,
--   drop column if exists steam_linked_at,
--   drop column if exists steam_synced_at,
--   drop column if exists steam_sync_error;
