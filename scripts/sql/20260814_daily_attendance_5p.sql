-- 사이트 출석 포인트: 하루(KST) 1회 5P. 기존 daily_login(10P)을 5P·"사이트 출석"으로 재정의.
-- reference_key=오늘 날짜(KST) + unique(member,reason,ref) 로 하루 1회만 지급된다.
-- SQL Editor 에서 직접 실행.

create or replace function public.claim_daily_login_points(p_member_id uuid)
returns table(awarded boolean,balance integer) language plpgsql security definer set search_path='' as $$
declare v_ref text := ((pg_catalog.now() at time zone 'Asia/Seoul')::date)::text; v_balance integer;
begin
  if not exists(select 1 from public.members m where m.id=p_member_id and m.status='approved') then raise exception 'member_not_approved'; end if;
  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id=p_member_id for update;
  begin
    insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after)
    values(p_member_id,5,'daily_login',v_ref,'사이트 출석',v_balance+5);
  exception when unique_violation then return query select false,v_balance; return; end;
  update public.point_accounts set balance=v_balance+5,updated_at=pg_catalog.now() where member_id=p_member_id;
  return query select true,v_balance+5;
end $$;

revoke all on function public.claim_daily_login_points(uuid) from public,anon,authenticated;
grant execute on function public.claim_daily_login_points(uuid) to service_role;
