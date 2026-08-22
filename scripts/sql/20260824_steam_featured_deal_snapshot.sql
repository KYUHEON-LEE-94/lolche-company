-- Steam 할인 목록은 외부 API의 마지막 정상 응답만 하나의 스냅샷으로 보관한다.
-- 공개 페이지는 service role reader를 통해 이 행만 조회한다.
create table if not exists public.steam_featured_deal_snapshots (
  id boolean primary key default true check (id),
  deals jsonb not null default '[]'::jsonb check (jsonb_typeof(deals) = 'array'),
  last_success_at timestamptz null,
  lock_token uuid null,
  lock_expires_at timestamptz null,
  updated_at timestamptz not null default now()
);

insert into public.steam_featured_deal_snapshots (id)
values (true)
on conflict (id) do nothing;

alter table public.steam_featured_deal_snapshots enable row level security;
revoke all on table public.steam_featured_deal_snapshots from public, anon, authenticated;
grant all on table public.steam_featured_deal_snapshots to service_role;

create or replace function public.claim_steam_featured_deal_sync(p_lock_token uuid)
returns table(status text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  state public.steam_featured_deal_snapshots%rowtype;
begin
  select * into state
  from public.steam_featured_deal_snapshots
  where id = true
  for update;

  if state.lock_expires_at is not null and state.lock_expires_at > now() then
    return query select 'locked'::text, greatest(1, ceil(extract(epoch from state.lock_expires_at - now()))::integer);
    return;
  end if;

  update public.steam_featured_deal_snapshots
  set lock_token = p_lock_token,
      lock_expires_at = now() + interval '2 minutes',
      updated_at = now()
  where id = true;
  return query select 'claimed'::text, 0;
end;
$$;

create or replace function public.finish_steam_featured_deal_sync(p_lock_token uuid, p_success boolean)
returns table(status text, last_success_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  state public.steam_featured_deal_snapshots%rowtype;
begin
  select * into state from public.steam_featured_deal_snapshots where id = true for update;
  if state.lock_token is distinct from p_lock_token then
    return query select 'not_owner'::text, state.last_success_at;
    return;
  end if;

  update public.steam_featured_deal_snapshots
  set lock_token = null,
      lock_expires_at = null,
      last_success_at = case when p_success then now() else last_success_at end,
      updated_at = now()
  where id = true
  returning * into state;
  return query select 'finished'::text, state.last_success_at;
end;
$$;

-- 검증된 Steam 응답만 lock 보유자가 원자적으로 교체한다. 실패 시 기존 deals/성공 시각은 유지된다.
create or replace function public.replace_steam_featured_deal_snapshot(p_lock_token uuid, p_deals jsonb)
returns table(status text, last_success_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  state public.steam_featured_deal_snapshots%rowtype;
begin
  if jsonb_typeof(p_deals) <> 'array' then
    raise exception 'invalid deals';
  end if;

  select * into state from public.steam_featured_deal_snapshots where id = true for update;
  if state.lock_token is distinct from p_lock_token then
    return query select 'not_owner'::text, state.last_success_at;
    return;
  end if;

  update public.steam_featured_deal_snapshots
  set deals = p_deals,
      lock_token = null,
      lock_expires_at = null,
      last_success_at = now(),
      updated_at = now()
  where id = true
  returning * into state;
  return query select 'replaced'::text, state.last_success_at;
end;
$$;

revoke all on function public.claim_steam_featured_deal_sync(uuid) from public, anon, authenticated;
revoke all on function public.finish_steam_featured_deal_sync(uuid, boolean) from public, anon, authenticated;
revoke all on function public.replace_steam_featured_deal_snapshot(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.claim_steam_featured_deal_sync(uuid) to service_role;
grant execute on function public.finish_steam_featured_deal_sync(uuid, boolean) to service_role;
grant execute on function public.replace_steam_featured_deal_snapshot(uuid, jsonb) to service_role;
