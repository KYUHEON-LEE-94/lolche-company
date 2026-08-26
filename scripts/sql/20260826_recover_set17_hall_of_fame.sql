-- 20260826_recover_set17_hall_of_fame.sql
-- set17(season_id=5)이 "원클릭 전환"이 아니라 수동 시즌 토글로 전환돼
-- 명예의 전당이 기록되지 않았다(아카이브 미수행). 랭크 보존 가드 덕에 set17 최종 랭크가
-- members(대표 캐시)에 그대로 남아 있어 소급 복구한다. 20260820 rollover RPC 의 아카이브 +
-- top3 포인트(100/50/20) + '17시즌 N위' 칭호 로직을 season 5 로만 스코프한 1회성 복구다.
--
-- ⚠ 전제: 20260813 / 20260816 / 20260820 이 이미 적용됨.
-- ⚠ 되도록 빨리 실행한다. set18 이 활성 상태라, 멤버가 set18 배치 랭크를 받으면 members 캐시가
--   갱신될 수 있다(그 전까진 가드가 set17 값을 보존한다). 실행 시점에 members 가 set17 최종이어야 한다.
-- 멱적: hall_of_fame 은 delete+insert, 포인트/칭호는 reference_key/key 로 재실행해도 1회만.
-- SQL Editor 에서 1회 실행.

do $$
declare
  v_season_id  bigint  := 5;
  v_set_number integer := 17;
  v_award  record;
  v_title_id uuid;
  v_bal integer;
  v_now timestamptz := clock_timestamp();
begin
  if not exists (select 1 from public.seasons where id = v_season_id and set_number = v_set_number) then
    raise exception 'season_id=% (set %) 이 존재하지 않습니다.', v_season_id, v_set_number;
  end if;

  -- 1) 아카이브 재구성 (현재 members = set17 최종, 승인 멤버 + 랭크 존재)
  delete from public.hall_of_fame where season_id = v_season_id;
  insert into public.hall_of_fame(season_id,member_id,queue_type,member_name_snapshot,profile_image_snapshot,discord_avatar_snapshot,tier,rank,lp,wins)
  select v_season_id,m.id,'solo',m.member_name,m.profile_image_path,
    case when m.discord_avatar_url like 'https://cdn.discordapp.com/%' then m.discord_avatar_url end,
    m.tft_tier,m.tft_rank,m.tft_league_points,0
    from public.members m where m.status='approved' and m.tft_tier is not null;
  insert into public.hall_of_fame(season_id,member_id,queue_type,member_name_snapshot,profile_image_snapshot,discord_avatar_snapshot,tier,rank,lp,wins)
  select v_season_id,m.id,'doubleup',m.member_name,m.profile_image_path,
    case when m.discord_avatar_url like 'https://cdn.discordapp.com/%' then m.discord_avatar_url end,
    m.tft_doubleup_tier,m.tft_doubleup_rank,m.tft_doubleup_league_points,0
    from public.members m where m.status='approved' and m.tft_doubleup_tier is not null;

  -- 2) top3 포인트 + 영구 칭호 (동점은 20260820 정책과 동일하게 제외)
  for v_award in
    with q as (
      select 'solo'::text as queue,m.id as member_id,m.tft_tier as tier,m.tft_rank as rk,m.tft_league_points as lp
        from public.members m where m.status='approved' and m.tft_tier is not null
      union all
      select 'doubleup',m.id,m.tft_doubleup_tier,m.tft_doubleup_rank,m.tft_doubleup_league_points
        from public.members m where m.status='approved' and m.tft_doubleup_tier is not null
    ), scored as (
      select q.*,
        row_number() over (partition by queue order by
          (case upper(tier) when 'CHALLENGER' then 1 when 'GRANDMASTER' then 2 when 'MASTER' then 3 when 'DIAMOND' then 4 when 'EMERALD' then 5 when 'PLATINUM' then 6 when 'GOLD' then 7 when 'SILVER' then 8 when 'BRONZE' then 9 when 'IRON' then 10 else 99 end),
          (case upper(coalesce(rk,'')) when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 else 1 end),
          coalesce(lp,0) desc) as pos,
        count(*) over (partition by queue,tier,rk,lp) as tie_count
      from q
    )
    select member_id,queue,pos,(case pos when 1 then 100 when 2 then 50 when 3 then 20 end) as amount
    from scored where pos <= 3 and tie_count = 1
  loop
    insert into public.achievement_titles(key,label,description,kind,condition_key,is_active,sort_order)
    values ('hof:'||v_season_id||':'||v_award.queue||':'||v_award.pos,
            v_set_number||'시즌 '||(case v_award.queue when 'solo' then '솔로' else '더블업' end)||' '||v_award.pos||'위',
            '명예의 전당 최종 순위','permanent','hof:'||v_season_id||':'||v_award.queue||':'||v_award.pos,true,
            1000 + v_set_number*10 + v_award.pos)
    on conflict(key) do update set label=excluded.label,is_active=true
    returning id into v_title_id;
    insert into public.member_title_inventory(member_id,title_id) values (v_award.member_id,v_title_id) on conflict do nothing;

    insert into public.point_accounts(member_id) values (v_award.member_id) on conflict do nothing;
    select balance into v_bal from public.point_accounts where member_id=v_award.member_id for update;
    begin
      insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after)
      values (v_award.member_id,v_award.amount,'hall_of_fame','hof:'||v_season_id||':'||v_award.queue||':'||v_award.pos,
              '명예의 전당 '||v_award.pos||'위 보상('||(case v_award.queue when 'solo' then '솔로' else '더블업' end)||')',
              v_bal+v_award.amount);
      update public.point_accounts set balance=v_bal+v_award.amount,updated_at=v_now where member_id=v_award.member_id;
    exception when unique_violation then null; -- 이미 지급됨(멱등)
    end;
  end loop;
end $$;

-- 검증:
-- select queue_type,count(*) from public.hall_of_fame where season_id=5 group by 1;
-- select key,label from public.achievement_titles where key like 'hof:5:%' order by key;
-- select member_id,amount,reference_key from public.point_ledger where reason='hall_of_fame' and reference_key like 'hof:5:%';
