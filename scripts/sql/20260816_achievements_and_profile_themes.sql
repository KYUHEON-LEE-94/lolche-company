-- 업적 칭호 + 프로필 카드 테마. SQL Editor에서 한 번 실행한다.
-- 코드 배포가 먼저 되어도 API는 migration_required 로 안전하게 degrade 한다.

alter table public.members add column if not exists profile_card_theme_key text;

create table if not exists public.profile_card_themes (
  id uuid primary key default gen_random_uuid(), key text not null unique, label text not null,
  description text not null default '', price_points integer not null check(price_points >= 0),
  is_active boolean not null default true, is_purchasable boolean not null default true,
  sort_order integer not null default 0, created_at timestamptz not null default now()
);
create table if not exists public.member_profile_theme_inventory (
  member_id uuid not null references public.members(id) on delete cascade,
  theme_id uuid not null references public.profile_card_themes(id) on delete cascade,
  price_paid integer not null check(price_paid >= 0), created_at timestamptz not null default now(),
  primary key(member_id, theme_id)
);

insert into public.profile_card_themes(key,label,description,price_points,sort_order) values
 ('neon_arcade','네온 아케이드','핑크와 시안의 레트로 네온',30,100),
 ('deep_ocean','딥 오션','깊은 바다의 청록빛 파동',30,110),
 ('blossom_garden','블라썸 가든','장밋빛 꽃안개가 감도는 정원',30,120),
 ('starlit_library','별빛 서재','금빛 별이 비추는 고요한 서재',30,130)
on conflict(key) do nothing;

create table if not exists public.achievement_titles (
  id uuid primary key default gen_random_uuid(), key text not null unique, label text not null,
  description text not null, kind text not null check(kind in ('permanent','conditional')),
  condition_key text not null, is_active boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.member_title_inventory (
  member_id uuid not null references public.members(id) on delete cascade,
  title_id uuid not null references public.achievement_titles(id) on delete cascade,
  acquired_at timestamptz not null default now(), primary key(member_id,title_id)
);
create table if not exists public.member_equipped_titles (
  member_id uuid not null references public.members(id) on delete cascade,
  slot smallint not null check(slot between 1 and 3), title_id uuid not null references public.achievement_titles(id) on delete cascade,
  primary key(member_id,slot), unique(member_id,title_id)
);
insert into public.achievement_titles(key,label,description,kind,condition_key,sort_order) values
 ('tft_win_streak_3','TFT 3연승','대표 TFT 솔로 계정으로 Top 4를 3회 연속 달성','conditional','tft_win_streak_3',100),
 ('operator','운영자','현재 운영진에게 부여되는 칭호','conditional','operator',110),
 ('attendance_king','출석왕','KST 기준 10일 연속 출석 달성','permanent','attendance_king',120),
 ('steam_king','스팀왕','최근 2주 Steam 플레이 50시간 달성','conditional','steam_king',130),
 ('variety_game_king','종겜왕','최근 2주 Steam 플레이 100시간 달성','conditional','variety_game_king',140)
on conflict(key) do nothing;

insert into public.achievement_titles(key,label,description,kind,condition_key,sort_order)
select 'tft_challenger_season_' || s.set_number, s.set_number || '시즌 챌린저', 'TFT에서 챌린저를 한 번이라도 달성', 'permanent', 'tft_challenger_season_' || s.set_number, 200 + s.set_number
from public.seasons s
where not exists (select 1 from public.achievement_titles t where t.key='tft_challenger_season_' || s.set_number);

create or replace function public.refresh_member_title_achievements(p_member_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_streak integer := 0; v_day date; v_i integer; v_steam_minutes integer := 0;
begin
  -- 10일 연속 로그인(원장의 KST 날짜)을 확인해 영구 칭호만 보유 처리한다.
  for v_i in 0..9 loop
    v_day := (now() at time zone 'Asia/Seoul')::date - v_i;
    if not exists (select 1 from public.point_ledger p where p.member_id=p_member_id and p.reason='daily_login' and (p.created_at at time zone 'Asia/Seoul')::date=v_day) then exit; end if;
    if v_i=9 then insert into public.member_title_inventory(member_id,title_id)
      select p_member_id,id from public.achievement_titles where key='attendance_king' on conflict do nothing; end if;
  end loop;
  -- 과거·현재 챌린저 모두 시즌별로 소급 보유한다.
  insert into public.achievement_titles(key,label,description,kind,condition_key,sort_order)
  select 'tft_challenger_season_' || s.set_number, s.set_number || '시즌 챌린저', 'TFT에서 챌린저를 한 번이라도 달성','permanent','tft_challenger_season_' || s.set_number,200+s.set_number
  from public.member_rank_history h join public.seasons s on s.id=h.season_id
  where h.member_id=p_member_id and (upper(coalesce(h.tft_tier,''))='CHALLENGER' or upper(coalesce(h.tft_doubleup_tier,''))='CHALLENGER') on conflict(key) do nothing;
  insert into public.member_title_inventory(member_id,title_id)
  select p_member_id,t.id from public.member_rank_history h join public.seasons s on s.id=h.season_id join public.achievement_titles t on t.key='tft_challenger_season_' || s.set_number
  where h.member_id=p_member_id and (upper(coalesce(h.tft_tier,''))='CHALLENGER' or upper(coalesce(h.tft_doubleup_tier,''))='CHALLENGER') on conflict do nothing;
  -- 조건형 상태가 바뀌면 기존 장착도 즉시 정리한다.
  select coalesce(sum(o.playtime_2weeks),0) into v_steam_minutes from public.steam_owned_games o where o.member_id=p_member_id;
  select count(*) into v_streak from (
    select p.placement from public.tft_match_participants p join public.tft_matches m on m.match_id=p.match_id
    where p.member_id=p_member_id and m.queue_id=1100 order by m.game_datetime desc nulls last limit 20
  ) x where x.placement <= 4;
  -- count only the initial Top4 run, not all Top4 games
  select count(*) into v_streak from (select p.placement,row_number() over(order by m.game_datetime desc nulls last) n from public.tft_match_participants p join public.tft_matches m on m.match_id=p.match_id where p.member_id=p_member_id and m.queue_id=1100 order by m.game_datetime desc nulls last limit 20) x where x.n <= coalesce((select min(n)-1 from (select p.placement,row_number() over(order by m.game_datetime desc nulls last) n from public.tft_match_participants p join public.tft_matches m on m.match_id=p.match_id where p.member_id=p_member_id and m.queue_id=1100 order by m.game_datetime desc nulls last limit 20) y where y.placement > 4),20) and x.placement <=4;
  delete from public.member_equipped_titles e using public.achievement_titles t where e.member_id=p_member_id and e.title_id=t.id and t.kind='conditional' and not (
    (t.condition_key='tft_win_streak_3' and v_streak>=3) or
    -- 관리자 페이지 방문 전에는 admins.user_id가 아직 비어 있을 수 있으므로
    -- Discord 사전등록(admins.discord_id)도 같은 운영자 권한으로 판정한다.
    (t.condition_key='operator' and exists(select 1 from public.members m join public.admins a on a.user_id=m.user_id or (a.discord_id is not null and a.discord_id=m.discord_id) where m.id=p_member_id)) or
    (t.condition_key='steam_king' and v_steam_minutes>=3000) or
    (t.condition_key='variety_game_king' and v_steam_minutes>=6000)
  );
end $$;

create or replace function public.list_my_title_achievements(p_member_id uuid) returns table(id uuid,key text,label text,description text,kind text,available boolean,equipped_slot smallint) language sql security definer set search_path='' as $$
 select t.id,t.key,t.label,t.description,t.kind,
   (i.title_id is not null or (t.condition_key='tft_win_streak_3' and (select count(*) from (select p.placement,row_number() over(order by m.game_datetime desc nulls last) n from public.tft_match_participants p join public.tft_matches m on m.match_id=p.match_id where p.member_id=p_member_id and m.queue_id=1100 order by m.game_datetime desc nulls last limit 20) q where q.n <= coalesce((select min(n)-1 from (select p.placement,row_number() over(order by m.game_datetime desc nulls last) n from public.tft_match_participants p join public.tft_matches m on m.match_id=p.match_id where p.member_id=p_member_id and m.queue_id=1100 order by m.game_datetime desc nulls last limit 20) z where z.placement>4),20) and q.placement<=4)>=3) or (t.condition_key='operator' and exists(select 1 from public.members m join public.admins a on a.user_id=m.user_id or (a.discord_id is not null and a.discord_id=m.discord_id) where m.id=p_member_id)) or (t.condition_key='steam_king' and coalesce((select sum(playtime_2weeks) from public.steam_owned_games where member_id=p_member_id),0)>=3000) or (t.condition_key='variety_game_king' and coalesce((select sum(playtime_2weeks) from public.steam_owned_games where member_id=p_member_id),0)>=6000)) as available,
   e.slot from public.achievement_titles t left join public.member_title_inventory i on i.title_id=t.id and i.member_id=p_member_id left join public.member_equipped_titles e on e.title_id=t.id and e.member_id=p_member_id where t.is_active order by t.sort_order,t.label;
$$;
create or replace function public.set_my_equipped_titles(p_member_id uuid,p_title_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if coalesce(array_length(p_title_ids,1),0)>3 or (select count(distinct x) from unnest(p_title_ids) x)<>coalesce(array_length(p_title_ids,1),0) then raise exception 'invalid titles'; end if;
 if not exists(select 1 from public.members where id=p_member_id and status='approved') then raise exception 'not approved'; end if;
 if exists(select 1 from unnest(p_title_ids) x left join public.list_my_title_achievements(p_member_id) t on t.id=x where t.id is null or not t.available) then raise exception 'unavailable title'; end if;
 delete from public.member_equipped_titles where member_id=p_member_id;
 insert into public.member_equipped_titles(member_id,slot,title_id) select p_member_id,ord::smallint,x from unnest(p_title_ids) with ordinality u(x,ord);
end $$;
create or replace function public.purchase_profile_card_theme(p_member_id uuid,p_theme_id uuid) returns table(status text,balance integer) language plpgsql security definer set search_path='' as $$
declare v_price integer; v_balance integer;
begin select price_points into v_price from public.profile_card_themes where id=p_theme_id and is_active and is_purchasable; if v_price is null then return query select 'not_found',null::integer; return; end if;
 insert into public.member_profile_theme_inventory(member_id,theme_id,price_paid) values(p_member_id,p_theme_id,v_price) on conflict do nothing;
 if found then update public.point_accounts set balance=balance-v_price where member_id=p_member_id and balance>=v_price returning balance into v_balance; if v_balance is null then delete from public.member_profile_theme_inventory where member_id=p_member_id and theme_id=p_theme_id; return query select 'insufficient',null::integer; return; end if; insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after) values(p_member_id,-v_price,'shop_purchase','profile_theme:'||p_theme_id,'프로필 카드 테마 구매',v_balance); end if;
 select balance into v_balance from public.point_accounts where member_id=p_member_id; return query select 'ok',v_balance;
end $$;
revoke all on function public.refresh_member_title_achievements(uuid),public.list_my_title_achievements(uuid),public.set_my_equipped_titles(uuid,uuid[]),public.purchase_profile_card_theme(uuid,uuid) from public,anon,authenticated;
grant execute on function public.refresh_member_title_achievements(uuid),public.list_my_title_achievements(uuid),public.set_my_equipped_titles(uuid,uuid[]),public.purchase_profile_card_theme(uuid,uuid) to service_role;
alter table public.profile_card_themes enable row level security; alter table public.member_profile_theme_inventory enable row level security; alter table public.achievement_titles enable row level security; alter table public.member_title_inventory enable row level security; alter table public.member_equipped_titles enable row level security;
-- 기존 멤버도 챌린저/출석왕을 소급한다.
do $$ declare r record; begin for r in select id from public.members loop perform public.refresh_member_title_achievements(r.id); end loop; end $$;
