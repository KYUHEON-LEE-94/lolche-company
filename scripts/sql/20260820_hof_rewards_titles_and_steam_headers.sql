-- 20260820_hof_rewards_titles_and_steam_headers.sql
-- 명예의 전당 정산 보상/영구 칭호/Discord 스냅샷 + Steam 헤더 이미지 캐시.
-- 20260813_hall_of_fame_top3_points.sql, 20260816_achievements_and_profile_themes.sql 이후 실행.

alter table public.steam_apps
  add column if not exists header_image_url text,
  add column if not exists header_image_checked_at timestamptz;

alter table public.hall_of_fame
  add column if not exists discord_avatar_snapshot text;

-- Store API가 실제 제공하는 Steam CDN URL만 저장한다. 기존 상세 확인 앱 중 이미지 누락 앱은
-- 앱 동기화의 header_image_url is null 조건으로 한 번 더 조회된다.
create index if not exists steam_apps_header_image_missing_idx
  on public.steam_apps (appid) where header_image_url is null;

-- 시즌 종료 시점 아바타가 없는 과거 수상자는 현재 Discord 아바타로 소급한다.
update public.hall_of_fame h
   set discord_avatar_snapshot = m.discord_avatar_url
  from public.members m
 where h.member_id = m.id
   and h.discord_avatar_snapshot is null
   and m.discord_avatar_url ~ '^https://cdn\\.discordapp\\.com/';

-- 같은 최종 순위 기준을 포인트와 칭호에 공유한다.
-- 동점은 20260813 정책과 동일하게 지급/칭호 대상에서 제외한다.
create or replace function public.rollover_tft_season(
  p_current_season_id bigint,
  p_confirmation text,
  p_next_season_name text,
  p_next_set_number integer,
  p_start_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.seasons%rowtype;
  v_existing_next public.seasons%rowtype;
  v_next public.seasons%rowtype;
  v_solo_count integer := 0;
  v_doubleup_count integer := 0;
  v_awarded integer := 0;
  v_award record;
  v_bal integer;
  v_title_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('public.rollover_tft_season'));

  if p_current_season_id is null or p_current_season_id <= 0 then raise exception '현재 시즌 ID가 올바르지 않습니다.' using errcode = '22023'; end if;
  if p_next_season_name is null or char_length(btrim(p_next_season_name)) not between 1 and 60 then raise exception '다음 시즌 이름은 1~60자로 입력하세요.' using errcode = '22023'; end if;
  if p_next_set_number is null or p_next_set_number not between 1 and 999 then raise exception '다음 세트 번호는 1~999의 정수여야 합니다.' using errcode = '22023'; end if;
  if p_start_at is null then raise exception '다음 시즌 시작 시각이 필요합니다.' using errcode = '22023'; end if;

  select * into v_current from public.seasons where id = p_current_season_id for update;
  if not found then raise exception '현재 시즌을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if p_confirmation is null or btrim(p_confirmation) <> v_current.season_name then raise exception '현재 시즌 이름을 정확히 입력하세요.' using errcode = '22023'; end if;

  if not v_current.is_active then
    select * into v_existing_next from public.seasons where set_number = p_next_set_number and is_active = true order by id desc limit 1;
    if found then
      return jsonb_build_object('status','already_completed','previous_season_id',v_current.id,'next_season_id',v_existing_next.id,'next_season_name',v_existing_next.season_name,'solo_count',(select count(*) from public.hall_of_fame where season_id=v_current.id and queue_type='solo'),'doubleup_count',(select count(*) from public.hall_of_fame where season_id=v_current.id and queue_type='doubleup'),'awarded_count',0);
    end if;
    raise exception '선택한 시즌은 이미 종료되었습니다.' using errcode = '55000';
  end if;
  if p_next_set_number <= v_current.set_number then raise exception '다음 세트 번호는 현재 세트 번호보다 커야 합니다.' using errcode = '22023'; end if;
  if exists (select 1 from public.seasons where set_number = p_next_set_number) then raise exception '같은 세트 번호의 시즌이 이미 존재합니다.' using errcode = '23505'; end if;

  delete from public.hall_of_fame where season_id = v_current.id;
  insert into public.hall_of_fame (season_id,member_id,queue_type,member_name_snapshot,profile_image_snapshot,discord_avatar_snapshot,tier,rank,lp,wins)
  select v_current.id,m.id,'solo',m.member_name,m.profile_image_path,case when m.discord_avatar_url ~ '^https://cdn\\.discordapp\\.com/' then m.discord_avatar_url end,m.tft_tier,m.tft_rank,m.tft_league_points,0
    from public.members m where m.status='approved' and m.tft_tier is not null;
  get diagnostics v_solo_count = row_count;
  insert into public.hall_of_fame (season_id,member_id,queue_type,member_name_snapshot,profile_image_snapshot,discord_avatar_snapshot,tier,rank,lp,wins)
  select v_current.id,m.id,'doubleup',m.member_name,m.profile_image_path,case when m.discord_avatar_url ~ '^https://cdn\\.discordapp\\.com/' then m.discord_avatar_url end,m.tft_doubleup_tier,m.tft_doubleup_rank,m.tft_doubleup_league_points,0
    from public.members m where m.status='approved' and m.tft_doubleup_tier is not null;
  get diagnostics v_doubleup_count = row_count;
  if v_solo_count = 0 and v_doubleup_count = 0 then raise exception '아카이브할 TFT 랭크 데이터가 없습니다.' using errcode = '55000'; end if;

  for v_award in
    with q as (
      select 'solo'::text as queue,m.id as member_id,m.tft_tier as tier,m.tft_rank as rk,m.tft_league_points as lp from public.members m where m.status='approved' and m.tft_tier is not null
      union all
      select 'doubleup',m.id,m.tft_doubleup_tier,m.tft_doubleup_rank,m.tft_doubleup_league_points from public.members m where m.status='approved' and m.tft_doubleup_tier is not null
    ), scored as (
      select q.*,row_number() over (partition by queue order by (case upper(tier) when 'CHALLENGER' then 1 when 'GRANDMASTER' then 2 when 'MASTER' then 3 when 'DIAMOND' then 4 when 'EMERALD' then 5 when 'PLATINUM' then 6 when 'GOLD' then 7 when 'SILVER' then 8 when 'BRONZE' then 9 when 'IRON' then 10 else 99 end),(case upper(coalesce(rk,'')) when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 else 1 end),coalesce(lp,0) desc) as pos,count(*) over (partition by queue,tier,rk,lp) as tie_count from q
    )
    select member_id,queue,pos,(case pos when 1 then 100 when 2 then 50 when 3 then 20 end) as amount from scored where pos <= 3 and tie_count = 1
  loop
    insert into public.achievement_titles(key,label,description,kind,condition_key,is_active,sort_order)
    values ('hof:'||v_current.id||':'||v_award.queue||':'||v_award.pos, v_current.set_number||'시즌 '||(case v_award.queue when 'solo' then '솔로' else '더블업' end)||' '||v_award.pos||'위', '명예의 전당 최종 순위', 'permanent', 'hof:'||v_current.id||':'||v_award.queue||':'||v_award.pos, true, 1000 + v_current.set_number * 10 + v_award.pos)
    on conflict(key) do update set label=excluded.label,description=excluded.description,kind=excluded.kind,condition_key=excluded.condition_key,is_active=true
    returning id into v_title_id;
    insert into public.member_title_inventory(member_id,title_id) values (v_award.member_id,v_title_id) on conflict do nothing;

    insert into public.point_accounts(member_id) values (v_award.member_id) on conflict do nothing;
    select balance into v_bal from public.point_accounts where member_id=v_award.member_id for update;
    begin
      insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after)
      values (v_award.member_id,v_award.amount,'hall_of_fame','hof:'||v_current.id||':'||v_award.queue||':'||v_award.pos,'명예의 전당 '||v_award.pos||'위 보상('||(case v_award.queue when 'solo' then '솔로' else '더블업' end)||')',v_bal+v_award.amount);
      update public.point_accounts set balance=v_bal+v_award.amount,updated_at=v_now where member_id=v_award.member_id;
      v_awarded := v_awarded + 1;
    exception when unique_violation then null;
    end;
  end loop;

  update public.seasons set is_active=false,end_date=v_now where id=v_current.id;
  insert into public.seasons(season_name,set_number,is_active,start_date,end_date) values(btrim(p_next_season_name),p_next_set_number,true,p_start_at,null) returning * into v_next;
  return jsonb_build_object('status','completed','previous_season_id',v_current.id,'next_season_id',v_next.id,'next_season_name',v_next.season_name,'solo_count',v_solo_count,'doubleup_count',v_doubleup_count,'awarded_count',v_awarded);
end;
$$;

revoke all on function public.rollover_tft_season(bigint,text,text,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.rollover_tft_season(bigint,text,text,integer,timestamptz) to service_role;

-- 이미 마감된 시즌의 실제 명예의 전당 기록을 소급해 영구 칭호를 부여한다.
with ranked as (
  select h.member_id,h.season_id,h.queue_type,s.set_number,
    row_number() over (partition by h.season_id,h.queue_type order by (case upper(h.tier) when 'CHALLENGER' then 1 when 'GRANDMASTER' then 2 when 'MASTER' then 3 when 'DIAMOND' then 4 when 'EMERALD' then 5 when 'PLATINUM' then 6 when 'GOLD' then 7 when 'SILVER' then 8 when 'BRONZE' then 9 when 'IRON' then 10 else 99 end),(case upper(coalesce(h.rank,'')) when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 else 1 end),coalesce(h.lp,0) desc) as pos,
    count(*) over (partition by h.season_id,h.queue_type,h.tier,h.rank,h.lp) as tie_count
  from public.hall_of_fame h join public.seasons s on s.id=h.season_id where h.member_id is not null
), titles as (
  insert into public.achievement_titles(key,label,description,kind,condition_key,is_active,sort_order)
  select 'hof:'||season_id||':'||queue_type||':'||pos,set_number||'시즌 '||(case queue_type when 'solo' then '솔로' else '더블업' end)||' '||pos||'위','명예의 전당 최종 순위','permanent','hof:'||season_id||':'||queue_type||':'||pos,true,1000+set_number*10+pos
  from ranked where pos<=3 and tie_count=1
  on conflict(key) do update set label=excluded.label,description=excluded.description,is_active=true
  returning id,key
)
insert into public.member_title_inventory(member_id,title_id)
select r.member_id,t.id from ranked r join titles t on t.key='hof:'||r.season_id||':'||r.queue_type||':'||r.pos
where r.pos<=3 and r.tie_count=1
on conflict do nothing;

-- 검증 예시:
-- select appid,name,header_image_url from public.steam_apps where appid=4704690;
-- select key,label from public.achievement_titles where key like 'hof:%' order by key;
-- select member_id,amount,reference_key from public.point_ledger where reason='hall_of_fame' order by created_at desc;
