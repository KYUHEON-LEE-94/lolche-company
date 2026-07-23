-- ============================================================================
-- 20260728_steam_shared_games.sql
--   "나와 같은 게임을 가진 사람들" 조회 RPC
--   실행 위치: Supabase 대시보드 → SQL Editor
--   전제: 20260724_steam.sql 적용 완료
--   ⚠ SQL 먼저 → 배포 나중.
--   ⚠ 신규 인덱스 없음 — steam_owned_games PK(member_id,appid) 와
--     기존 steam_owned_games_appid_idx 로 충분하다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1. 사람 축 요약 — 겹치는 게임 수 + 미리보기 3개
--   ⚠ 상대방에 status='approved' 필터를 반드시 건다 (CLAUDE.md 노출 필터).
--   ⚠ p_multiplayer_only 는 is_multiplayer = false 만 제외. null 은 남긴다
--     (app/steam/page.tsx 의 기존 방침과 동일).
-- ---------------------------------------------------------------------------
create or replace function public.steam_shared_with_member(
  p_member_id        uuid,
  p_multiplayer_only boolean default true
)
returns table (
  member_id          uuid,
  member_name        text,
  steam_avatar_url   text,
  profile_image_path text,
  shared_count       bigint,
  preview_names      text[]
)
language sql stable security definer set search_path = public
as $$
  with shared as (
    select theirs.member_id as other_id, a.appid, a.name,
           (mine.playtime_forever > 0 and theirs.playtime_forever > 0) as both_played
      from public.steam_owned_games mine
      join public.steam_owned_games theirs
        on theirs.appid = mine.appid and theirs.member_id <> mine.member_id
      join public.steam_apps a on a.appid = mine.appid
      join public.members    m on m.id    = theirs.member_id
     where mine.member_id = p_member_id
       and m.status = 'approved'              -- 노출 필터
       and m.steam_id64 is not null
       and (not coalesce(p_multiplayer_only, true)
            or a.is_multiplayer is distinct from false)
  ),
  ranked as (
    select s.*, row_number() over (
             partition by s.other_id order by s.both_played desc, s.name asc
           ) as rn
      from shared s
  )
  select m.id, m.member_name, m.steam_avatar_url, m.profile_image_path,
         count(*) as shared_count,
         array_remove(array_agg(r.name order by r.rn) filter (where r.rn <= 3), null)
    from ranked r
    join public.members m on m.id = r.other_id
   group by m.id, m.member_name, m.steam_avatar_url, m.profile_image_path
   order by shared_count desc, m.member_name asc;
$$;

-- ---------------------------------------------------------------------------
-- STEP 2. 게임 축 상세 — 특정 상대와 겹치는 전체 게임 (펼침 시 지연 로딩)
-- ---------------------------------------------------------------------------
create or replace function public.steam_shared_games_detail(
  p_member_id        uuid,
  p_other_member_id  uuid,
  p_multiplayer_only boolean default true,
  p_limit            int     default 200
)
returns table (
  appid int, name text, is_multiplayer boolean,
  my_playtime_forever int, their_playtime_forever int
)
language sql stable security definer set search_path = public
as $$
  select a.appid, a.name, a.is_multiplayer,
         mine.playtime_forever, theirs.playtime_forever
    from public.steam_owned_games mine
    join public.steam_owned_games theirs
      on theirs.appid = mine.appid and theirs.member_id = p_other_member_id
    join public.steam_apps a on a.appid = mine.appid
    join public.members    m on m.id    = theirs.member_id
   where mine.member_id = p_member_id
     and m.status = 'approved'
     and m.steam_id64 is not null
     and (not coalesce(p_multiplayer_only, true)
          or a.is_multiplayer is distinct from false)
   order by (mine.playtime_forever + theirs.playtime_forever) desc, a.name asc
   limit least(greatest(coalesce(p_limit, 200), 1), 500);
$$;

-- ---------------------------------------------------------------------------
-- STEP 3. 권한 — 서버 라우트(service role) 전용
--   security definer 함수에 authenticated 실행권을 남기면 브라우저에서
--   임의의 p_member_id 로 남의 겹침 목록을 조회할 수 있다.
-- ---------------------------------------------------------------------------
revoke all on function public.steam_shared_with_member(uuid, boolean)
  from public, anon, authenticated;
revoke all on function public.steam_shared_games_detail(uuid, uuid, boolean, int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- STEP 4. 검증
-- ---------------------------------------------------------------------------
-- select id, member_name from public.members
--  where status='approved' and steam_id64 is not null limit 3;
-- select * from public.steam_shared_with_member('<member-uuid>', true);
-- explain analyze select * from public.steam_shared_with_member('<member-uuid>', true);
--   -- steam_owned_games_pkey + steam_owned_games_appid_idx 사용 확인

-- 롤백:
--   drop function if exists public.steam_shared_games_detail(uuid, uuid, boolean, int);
--   drop function if exists public.steam_shared_with_member(uuid, boolean);
