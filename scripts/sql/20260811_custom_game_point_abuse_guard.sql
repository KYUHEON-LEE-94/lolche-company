-- 내전 생성→종료 반복으로 포인트를 파밍하는 악용 차단.
-- end_custom_game_and_award_points 를 재정의: (1) 멤버별 일일 지급 상한, (2) 최소 확정 멤버 수.
-- 기존 per-game 중복 방지(reference_key=game_id)는 그대로 유지한다. SQL Editor 에서 직접 실행.

create or replace function public.end_custom_game_and_award_points(p_game_id uuid)
returns table(status text,confirmed_count integer,awarded_count integer,already_awarded_count integer,ended_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
  c_min_members constant integer := 2; -- 확정 멤버가 이 수 미만이면 지급 안 함(혼자 파밍 차단)
  c_daily_cap  constant integer := 3;  -- 멤버 1명이 하루(KST)에 받을 수 있는 내전 참가 보상 횟수 상한
  v_game public.custom_games%rowtype; v_guest_count integer; v_limit integer; v_member uuid;
  v_balance integer; v_confirmed integer:=0; v_awarded integer:=0; v_existing integer:=0; v_was_ended boolean;
  v_ended_at timestamptz; v_today integer;
begin
  select * into v_game from public.custom_games where id=p_game_id for update;
  if not found then return query select 'not_found'::text,0,0,0,null::timestamptz; return; end if;
  if v_game.status='cancelled' then return query select 'invalid_status'::text,0,0,0,v_game.ended_at; return; end if;
  v_was_ended := v_game.status='ended';
  select pg_catalog.count(*)::integer into v_guest_count from public.custom_game_guests where custom_game_id=p_game_id;
  v_limit := greatest(v_game.capacity-v_guest_count,0);
  create temporary table if not exists pg_temp.confirmed_point_members(member_id uuid primary key) on commit drop;
  truncate pg_temp.confirmed_point_members;
  insert into pg_temp.confirmed_point_members(member_id)
  select ranked.member_id from (
    select p.member_id,pg_catalog.row_number() over(order by p.joined_at,p.id) rn
    from public.custom_game_participants p where p.custom_game_id=p_game_id
  ) ranked where ranked.rn<=v_limit and ranked.member_id is not null;
  select pg_catalog.count(*)::integer into v_confirmed from pg_temp.confirmed_point_members;

  -- (2) 최소 인원: 확정 멤버가 c_min_members 미만이면 보상 없이 종료만 처리한다.
  if v_confirmed >= c_min_members then
    for v_member in select member_id from pg_temp.confirmed_point_members order by member_id loop
      insert into public.point_accounts(member_id) values(v_member) on conflict do nothing;
      select a.balance into v_balance from public.point_accounts a where a.member_id=v_member for update;
      if exists(select 1 from public.point_ledger l where l.member_id=v_member and l.reason='custom_game_participation' and l.reference_key=p_game_id::text) then
        v_existing:=v_existing+1;
      else
        -- (1) 일일 상한: 오늘(KST) 이미 c_daily_cap 회 받았으면 지급 스킵.
        select pg_catalog.count(*) into v_today from public.point_ledger l
          where l.member_id=v_member and l.reason='custom_game_participation'
            and (l.created_at at time zone 'Asia/Seoul')::date = (pg_catalog.now() at time zone 'Asia/Seoul')::date;
        if v_today >= c_daily_cap then
          continue;
        end if;
        insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after)
        values(v_member,10,'custom_game_participation',p_game_id::text,'내전 종료 참가 보상',v_balance+10);
        update public.point_accounts set balance=v_balance+10,updated_at=pg_catalog.now() where member_id=v_member;
        v_awarded:=v_awarded+1;
      end if;
    end loop;
  end if;

  update public.custom_games set status='ended',ended_at=coalesce(custom_games.ended_at,pg_catalog.now()) where id=p_game_id returning custom_games.ended_at into v_ended_at;
  return query select case when v_was_ended then 'already_ended' else 'completed' end,v_confirmed,v_awarded,v_existing,v_ended_at;
end $$;

revoke all on function public.end_custom_game_and_award_points(uuid) from public,anon,authenticated;
grant execute on function public.end_custom_game_and_award_points(uuid) to service_role;
