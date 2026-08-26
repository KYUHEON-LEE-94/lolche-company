-- 롤(LoL) 공식 패치 소식. TFT 와 달리 시즌에 귀속되지 않는 전역 최근 소식이다.
-- 기사 본문은 저장하지 않고 제목/요약/공식 링크만 캐시한다. SQL Editor 에서 실행.

create table if not exists public.lol_patch_notes (
  id uuid primary key default gen_random_uuid(),
  title varchar(160) not null check (char_length(btrim(title)) between 1 and 160),
  summary varchar(300) not null default '' check (char_length(summary) <= 300),
  source_key text not null unique,
  source_url text not null,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lol_patch_notes_public_list_idx
  on public.lol_patch_notes (published_at desc nulls last, created_at desc);
alter table public.lol_patch_notes enable row level security;
revoke all on table public.lol_patch_notes from anon, authenticated;
grant all on table public.lol_patch_notes to service_role;

create table if not exists public.lol_patch_note_sync_state (
  id boolean primary key default true check (id),
  last_success_at timestamptz null,
  lock_token uuid null,
  lock_expires_at timestamptz null,
  updated_at timestamptz not null default now()
);
insert into public.lol_patch_note_sync_state (id) values (true) on conflict (id) do nothing;
alter table public.lol_patch_note_sync_state enable row level security;
revoke all on table public.lol_patch_note_sync_state from anon, authenticated;
grant all on table public.lol_patch_note_sync_state to service_role;

create or replace function public.claim_lol_patch_note_sync(p_lock_token uuid, p_min_interval_seconds integer)
returns table(status text, retry_after_seconds integer) language plpgsql security definer set search_path = public as $$
declare state public.lol_patch_note_sync_state%rowtype; retry_seconds integer;
begin
  if p_min_interval_seconds < 0 then raise exception 'invalid interval'; end if;
  select * into state from public.lol_patch_note_sync_state where id = true for update;
  if state.lock_expires_at is not null and state.lock_expires_at > now() then
    return query select 'locked'::text, greatest(1, ceil(extract(epoch from state.lock_expires_at - now()))::integer); return;
  end if;
  if state.last_success_at is not null and state.last_success_at + make_interval(secs => p_min_interval_seconds) > now() then
    retry_seconds := greatest(1, ceil(extract(epoch from state.last_success_at + make_interval(secs => p_min_interval_seconds) - now()))::integer);
    return query select 'cooldown'::text, retry_seconds; return;
  end if;
  update public.lol_patch_note_sync_state set lock_token = p_lock_token, lock_expires_at = now() + interval '2 minutes', updated_at = now() where id = true;
  return query select 'claimed'::text, 0;
end; $$;

create or replace function public.finish_lol_patch_note_sync(p_lock_token uuid, p_success boolean)
returns table(status text, last_success_at timestamptz) language plpgsql security definer set search_path = public as $$
declare state public.lol_patch_note_sync_state%rowtype;
begin
  select * into state from public.lol_patch_note_sync_state where id = true for update;
  if state.lock_token is distinct from p_lock_token then return query select 'not_owner'::text, state.last_success_at; return; end if;
  update public.lol_patch_note_sync_state set lock_token = null, lock_expires_at = null,
    last_success_at = case when p_success then now() else last_success_at end, updated_at = now()
  where id = true returning * into state;
  return query select 'finished'::text, state.last_success_at;
end; $$;

revoke all on function public.claim_lol_patch_note_sync(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_lol_patch_note_sync(uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_lol_patch_note_sync(uuid, integer) to service_role;
grant execute on function public.finish_lol_patch_note_sync(uuid, boolean) to service_role;
