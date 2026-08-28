-- 버그픽스: finish_tft/lol_patch_note_sync 의 UPDATE SET 절에서 last_success_at 이
-- 반환(OUT) 컬럼과 테이블 컬럼 사이에서 모호(42702: column reference "last_success_at" is ambiguous)해
-- finish 가 항상 실패했다. 그 결과 패치 노트 크론이 502 로 죽고 last_success_at 이 갱신되지 않았다.
-- (fetch·upsert 는 정상 — Riot 차단이 아니라 이 SQL 모호성이 원인이었다.)
-- #variable_conflict use_column 으로 함수 내 모호한 식별자를 "컬럼 우선"으로 해석해 해결한다.
-- OUT 값은 전부 state.* 로 한정 참조하므로 use_column 이 안전하다. SQL Editor 에서 실행.

create or replace function public.finish_tft_patch_note_sync(p_lock_token uuid, p_success boolean)
returns table(status text, last_success_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare state public.tft_patch_note_sync_state%rowtype;
begin
  select * into state from public.tft_patch_note_sync_state where id = true for update;
  if state.lock_token is distinct from p_lock_token then
    return query select 'not_owner'::text, state.last_success_at; return;
  end if;
  update public.tft_patch_note_sync_state
  set lock_token = null, lock_expires_at = null,
      last_success_at = case when p_success then now() else last_success_at end,
      updated_at = now()
  where id = true returning * into state;
  return query select 'finished'::text, state.last_success_at;
end; $$;

create or replace function public.finish_lol_patch_note_sync(p_lock_token uuid, p_success boolean)
returns table(status text, last_success_at timestamptz)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare state public.lol_patch_note_sync_state%rowtype;
begin
  select * into state from public.lol_patch_note_sync_state where id = true for update;
  if state.lock_token is distinct from p_lock_token then
    return query select 'not_owner'::text, state.last_success_at; return;
  end if;
  update public.lol_patch_note_sync_state
  set lock_token = null, lock_expires_at = null,
      last_success_at = case when p_success then now() else last_success_at end,
      updated_at = now()
  where id = true returning * into state;
  return query select 'finished'::text, state.last_success_at;
end; $$;

revoke all on function public.finish_tft_patch_note_sync(uuid, boolean) from public, anon, authenticated;
revoke all on function public.finish_lol_patch_note_sync(uuid, boolean) from public, anon, authenticated;
grant execute on function public.finish_tft_patch_note_sync(uuid, boolean) to service_role;
grant execute on function public.finish_lol_patch_note_sync(uuid, boolean) to service_role;
