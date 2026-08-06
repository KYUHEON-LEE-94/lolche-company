-- 기존 조기 지급을 즉시 차단한다. DROP은 기존 execute grant도 함께 제거한다.
drop function if exists public.claim_custom_game_participation_points(uuid,uuid);

alter table public.point_ledger add column if not exists created_by uuid null references auth.users(id) on delete set null;
create unique index if not exists point_ledger_admin_request_uniq on public.point_ledger(reference_key) where reason='admin_adjustment';

create or replace function public.end_custom_game_and_award_points(p_game_id uuid)
returns table(status text,confirmed_count integer,awarded_count integer,already_awarded_count integer,ended_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare
  v_game public.custom_games%rowtype; v_guest_count integer; v_limit integer; v_member uuid;
  v_balance integer; v_confirmed integer:=0; v_awarded integer:=0; v_existing integer:=0; v_was_ended boolean;
  v_ended_at timestamptz;
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
  for v_member in select member_id from pg_temp.confirmed_point_members order by member_id loop
    insert into public.point_accounts(member_id) values(v_member) on conflict do nothing;
    select a.balance into v_balance from public.point_accounts a where a.member_id=v_member for update;
    if exists(select 1 from public.point_ledger l where l.member_id=v_member and l.reason='custom_game_participation' and l.reference_key=p_game_id::text) then
      v_existing:=v_existing+1;
    else
      insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after)
      values(v_member,10,'custom_game_participation',p_game_id::text,'내전 종료 참가 보상',v_balance+10);
      update public.point_accounts set balance=v_balance+10,updated_at=pg_catalog.now() where member_id=v_member;
      v_awarded:=v_awarded+1;
    end if;
  end loop;
  update public.custom_games set status='ended',ended_at=coalesce(custom_games.ended_at,pg_catalog.now()) where id=p_game_id returning custom_games.ended_at into v_ended_at;
  return query select case when v_was_ended then 'already_ended' else 'completed' end,v_confirmed,v_awarded,v_existing,v_ended_at;
end $$;

create or replace function public.grant_member_points(p_member_id uuid,p_amount integer,p_request_id uuid,p_actor_user_id uuid,p_description text)
returns table(status text,balance integer) language plpgsql security definer set search_path='' as $$
declare v_balance integer; v_description text:=pg_catalog.btrim(p_description); v_ref text:='grant:'||p_request_id::text; v_existing_member uuid;
begin
  if not exists(select 1 from public.admins where user_id=p_actor_user_id) then return query select 'forbidden'::text,0; return; end if;
  if p_amount is null or p_amount<1 or p_amount>10000 then return query select 'invalid_amount'::text,0; return; end if;
  if v_description is null or pg_catalog.char_length(v_description)<1 or pg_catalog.char_length(v_description)>200 then return query select 'invalid_description'::text,0; return; end if;
  if not exists(select 1 from public.members where id=p_member_id and status='approved') then return query select 'not_found'::text,0; return; end if;
  select member_id into v_existing_member from public.point_ledger where reason='admin_adjustment' and reference_key=v_ref;
  if found then
    select a.balance into v_balance from public.point_accounts a where a.member_id=v_existing_member;
    return query select case when v_existing_member=p_member_id then 'already_applied' else 'request_conflict' end,coalesce(v_balance,0); return;
  end if;
  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id=p_member_id for update;
  begin
    insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after,created_by)
    values(p_member_id,p_amount,'admin_adjustment',v_ref,v_description,v_balance+p_amount,p_actor_user_id);
  exception when unique_violation then
    select member_id into v_existing_member from public.point_ledger where reason='admin_adjustment' and reference_key=v_ref;
    select a.balance into v_balance from public.point_accounts a where a.member_id=v_existing_member;
    return query select case when v_existing_member=p_member_id then 'already_applied' else 'request_conflict' end,coalesce(v_balance,0); return;
  end;
  update public.point_accounts set balance=v_balance+p_amount,updated_at=pg_catalog.now() where member_id=p_member_id;
  return query select 'granted'::text,v_balance+p_amount;
end $$;

revoke all on function public.end_custom_game_and_award_points(uuid),public.grant_member_points(uuid,integer,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.end_custom_game_and_award_points(uuid),public.grant_member_points(uuid,integer,uuid,uuid,text) to service_role;

-- 기존 조기 지급 현황 확인(회수하지 않음):
-- select coalesce(g.status,'deleted') status,count(*) from public.point_ledger l left join public.custom_games g on g.id::text=l.reference_key where l.reason='custom_game_participation' group by 1;
