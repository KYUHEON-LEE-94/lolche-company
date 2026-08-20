-- 매달 1일: 전월 디스코드 음성 활동 1위에게 포인트 지급.
-- 시스템 지급이라 admin actor 를 요구하지 않는다(grant_member_points 와 다른 지점).
-- 멱등성은 reason='admin_adjustment' + reference_key(=voice_top:YYYY-MM) 부분 유니크 인덱스로 보장한다
--   (20260807 의 point_ledger_admin_request_uniq). 두 번 호출해도 'already_applied' 로 응답.
-- SQL Editor 에서 먼저 실행한 뒤 배포한다.

create or replace function public.award_monthly_voice_top(
  p_member_id uuid,
  p_amount integer,
  p_reference_key text,
  p_description text
) returns table(status text, balance integer) language plpgsql security definer set search_path='' as $$
declare v_balance integer; v_desc text := pg_catalog.btrim(p_description);
begin
  if p_amount is null or p_amount <= 0 or p_amount > 10000 then
    return query select 'invalid_amount'::text, 0; return;
  end if;
  if v_desc is null or pg_catalog.char_length(v_desc) < 1 or pg_catalog.char_length(v_desc) > 200 then
    return query select 'invalid_description'::text, 0; return;
  end if;
  if p_reference_key is null or pg_catalog.char_length(p_reference_key) < 1 or pg_catalog.char_length(p_reference_key) > 100 then
    return query select 'invalid_reference'::text, 0; return;
  end if;
  if not exists(select 1 from public.members m where m.id = p_member_id and m.status = 'approved') then
    return query select 'not_found'::text, 0; return;
  end if;

  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id = p_member_id for update;

  begin
    insert into public.point_ledger(member_id, amount, reason, reference_key, description, balance_after)
    values(p_member_id, p_amount, 'admin_adjustment', p_reference_key, v_desc, v_balance + p_amount);
  exception when unique_violation then
    -- 이미 이번 달 지급됨(같은 reference_key). 멱등 응답.
    return query select 'already_applied'::text, v_balance; return;
  end;

  update public.point_accounts set balance = v_balance + p_amount, updated_at = pg_catalog.now()
   where member_id = p_member_id;
  return query select 'granted'::text, v_balance + p_amount;
end $$;

revoke all on function public.award_monthly_voice_top(uuid, integer, text, text) from public, anon, authenticated;
grant execute on function public.award_monthly_voice_top(uuid, integer, text, text) to service_role;
