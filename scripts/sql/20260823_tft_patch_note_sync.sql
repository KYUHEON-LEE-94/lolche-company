-- 공식 TFT 패치 노트 메타데이터 동기화. 기사 본문은 저장하지 않는다.
alter table public.tft_patch_notes
  add column if not exists source_key text null,
  add column if not exists source_url text null,
  add column if not exists source_published_at timestamptz null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tft_patch_notes'::regclass
      and conname = 'tft_patch_notes_source_key_unique'
  ) then
    alter table public.tft_patch_notes
      add constraint tft_patch_notes_source_key_unique unique (source_key);
  end if;
end;
$$;

create index if not exists tft_patch_notes_source_public_list_idx
  on public.tft_patch_notes (season_id, is_published, source_published_at desc)
  where source_key is not null;

create table if not exists public.tft_patch_note_sync_state (
  id boolean primary key default true check (id),
  last_success_at timestamptz null,
  lock_token uuid null,
  lock_expires_at timestamptz null,
  updated_at timestamptz not null default now()
);

insert into public.tft_patch_note_sync_state (id)
values (true)
on conflict (id) do nothing;

alter table public.tft_patch_note_sync_state enable row level security;
revoke all on table public.tft_patch_note_sync_state from anon, authenticated;
grant all on table public.tft_patch_note_sync_state to service_role;

create or replace function public.claim_tft_patch_note_sync(
  p_lock_token uuid,
  p_min_interval_seconds integer
)
returns table(status text, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  state public.tft_patch_note_sync_state%rowtype;
  retry_seconds integer;
begin
  if p_min_interval_seconds < 0 then
    raise exception 'invalid interval';
  end if;

  select * into state
  from public.tft_patch_note_sync_state
  where id = true
  for update;

  if state.lock_expires_at is not null and state.lock_expires_at > now() then
    return query select 'locked'::text, greatest(1, ceil(extract(epoch from state.lock_expires_at - now()))::integer);
    return;
  end if;

  if state.last_success_at is not null and state.last_success_at + make_interval(secs => p_min_interval_seconds) > now() then
    retry_seconds := greatest(1, ceil(extract(epoch from state.last_success_at + make_interval(secs => p_min_interval_seconds) - now()))::integer);
    return query select 'cooldown'::text, retry_seconds;
    return;
  end if;

  update public.tft_patch_note_sync_state
  set lock_token = p_lock_token, lock_expires_at = now() + interval '2 minutes', updated_at = now()
  where id = true;
  return query select 'claimed'::text, 0;
end;
$$;

create or replace function public.finish_tft_patch_note_sync(p_lock_token uuid, p_success boolean)
returns table(status text, last_success_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  state public.tft_patch_note_sync_state%rowtype;
begin
  select * into state from public.tft_patch_note_sync_state where id = true for update;
  if state.lock_token is distinct from p_lock_token then
    return query select 'not_owner'::text, state.last_success_at;
    return;
  end if;

  update public.tft_patch_note_sync_state
  set lock_token = null,
      lock_expires_at = null,
      last_success_at = case when p_success then now() else last_success_at end,
      updated_at = now()
  where id = true
  returning * into state;

  return query select 'finished'::text, state.last_success_at;
end;
$$;

revoke all on function public.claim_tft_patch_note_sync(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_tft_patch_note_sync(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_tft_patch_note_sync(uuid, integer) to service_role;
grant execute on function public.finish_tft_patch_note_sync(uuid, boolean) to service_role;
