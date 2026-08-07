-- 버그픽스: grant_member_points 의 members.status 참조가 반환 컬럼(OUT status)과 모호(42702)해
-- 실제 지급이 전부 500 으로 실패하던 문제. members 에 별칭(m)을 붙여 m.status 로 명확히 한다.
-- 20260808(음수 지원) 정의 기반 + 이 수정. SQL Editor 에서 직접 실행.

create or replace function public.grant_member_points(p_member_id uuid,p_amount integer,p_request_id uuid,p_actor_user_id uuid,p_description text)
returns table(status text,balance integer) language plpgsql security definer set search_path='' as $$
declare v_balance integer; v_description text:=pg_catalog.btrim(p_description); v_ref text:='grant:'||p_request_id::text; v_existing_member uuid;
begin
  if not exists(select 1 from public.admins a where a.user_id=p_actor_user_id) then return query select 'forbidden'::text,0; return; end if;
  if p_amount is null or p_amount=0 or p_amount<-10000 or p_amount>10000 then return query select 'invalid_amount'::text,0; return; end if;
  if v_description is null or pg_catalog.char_length(v_description)<1 or pg_catalog.char_length(v_description)>200 then return query select 'invalid_description'::text,0; return; end if;
  -- ★ m.status 로 명확화 (OUT 파라미터 status 와의 모호성 제거)
  if not exists(select 1 from public.members m where m.id=p_member_id and m.status='approved') then return query select 'not_found'::text,0; return; end if;
  select ledger.member_id into v_existing_member from public.point_ledger ledger where ledger.reason='admin_adjustment' and ledger.reference_key=v_ref;
  if found then
    select a.balance into v_balance from public.point_accounts a where a.member_id=v_existing_member;
    return query select case when v_existing_member=p_member_id then 'already_applied' else 'request_conflict' end,coalesce(v_balance,0); return;
  end if;
  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id=p_member_id for update;
  if v_balance+p_amount<0 then return query select 'insufficient'::text,v_balance; return; end if;
  begin
    insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after,created_by)
    values(p_member_id,p_amount,'admin_adjustment',v_ref,v_description,v_balance+p_amount,p_actor_user_id);
  exception when unique_violation then
    select ledger.member_id into v_existing_member from public.point_ledger ledger where ledger.reason='admin_adjustment' and ledger.reference_key=v_ref;
    select a.balance into v_balance from public.point_accounts a where a.member_id=v_existing_member;
    return query select case when v_existing_member=p_member_id then 'already_applied' else 'request_conflict' end,coalesce(v_balance,0); return;
  end;
  update public.point_accounts set balance=v_balance+p_amount,updated_at=pg_catalog.now() where member_id=p_member_id;
  return query select 'granted'::text,v_balance+p_amount;
end $$;

revoke all on function public.grant_member_points(uuid,integer,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.grant_member_points(uuid,integer,uuid,uuid,text) to service_role;
