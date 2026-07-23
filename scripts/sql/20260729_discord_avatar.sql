-- ============================================================================
-- 20260729_discord_avatar.sql
--   프로필 이미지를 Discord 아바타 기반으로 전환한다.
--   실행 위치: Supabase 대시보드 -> SQL Editor
--   전제: 20260728_steam_shared_games.sql 적용 완료
--   ⚠ SQL 먼저 -> 배포 나중.
--   ⚠ 미적용 상태에서도 앱은 42703 을 흡수해 업로드 이미지만 보이는 상태로 degrade 한다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1. members.discord_avatar_url
--   auth/callback 이 로그인할 때마다 갱신한다(Discord 아바타는 사용자가 바꿀 수 있다).
--   URL 원문을 그대로 저장하며, 앱은 저장/표시 양쪽에서 cdn.discordapp.com 인지 검증한다.
-- ---------------------------------------------------------------------------
alter table public.members
  add column if not exists discord_avatar_url text;

-- ---------------------------------------------------------------------------
-- STEP 2. "나와 같은 게임" RPC 에 아바타 컬럼 추가
--   returns table 시그니처가 바뀌므로 drop 후 재생성해야 한다.
--   ⚠ 20260728 의 본문과 동일하고 select 목록에만 discord_avatar_url 이 추가됐다.
-- ---------------------------------------------------------------------------
drop function if exists public.steam_shared_with_member(uuid, boolean);

create function public.steam_shared_with_member(
  p_member_id        uuid,
  p_multiplayer_only boolean default true
)
returns table (
  member_id          uuid,
  member_name        text,
  steam_avatar_url   text,
  profile_image_path text,
  discord_avatar_url text,
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
  select m.id, m.member_name, m.steam_avatar_url, m.profile_image_path, m.discord_avatar_url,
         count(*) as shared_count,
         array_remove(array_agg(r.name order by r.rn) filter (where r.rn <= 3), null)
    from ranked r
    join public.members m on m.id = r.other_id
   group by m.id, m.member_name, m.steam_avatar_url, m.profile_image_path, m.discord_avatar_url
   order by shared_count desc, m.member_name asc;
$$;

-- security definer 함수에 authenticated 실행권을 남기면 브라우저에서
-- 임의의 p_member_id 로 남의 겹침 목록을 조회할 수 있다. 서버 라우트(service role) 전용.
revoke all on function public.steam_shared_with_member(uuid, boolean)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- STEP 3. 검증
-- ---------------------------------------------------------------------------
-- select id, member_name, discord_avatar_url from public.members
--  where discord_avatar_url is not null;
-- select * from public.steam_shared_with_member('<member-uuid>', true);

-- 롤백:
--   alter table public.members drop column if exists discord_avatar_url;
--   -- 그리고 20260728_steam_shared_games.sql 의 STEP 1 을 다시 실행해 RPC 를 되돌린다.
