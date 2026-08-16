-- 공개 랭킹 카드용 장착 칭호 배치 조회.
-- service role 전용 RPC로 두어 브라우저에서 임의의 멤버 목록을 조회할 수 없게 한다.
create or replace function public.list_public_equipped_titles(p_member_ids uuid[])
returns table(member_id uuid, title_id uuid, label text, slot smallint)
language sql
stable
security definer
set search_path = ''
as $$
  select e.member_id, e.title_id, t.label, e.slot
  from public.member_equipped_titles e
  join public.achievement_titles t on t.id = e.title_id
  join public.members m on m.id = e.member_id
  where e.member_id = any(coalesce(p_member_ids, array[]::uuid[]))
    and m.status = 'approved'
    and t.is_active
  order by e.member_id, e.slot;
$$;

revoke all on function public.list_public_equipped_titles(uuid[]) from public, anon, authenticated;
grant execute on function public.list_public_equipped_titles(uuid[]) to service_role;
