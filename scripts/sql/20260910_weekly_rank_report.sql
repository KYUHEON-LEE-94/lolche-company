-- 주간 랭크 리포트 발송 상태.
-- 같은 주(week_key = KST 월요일 YYYY-MM-DD)에 두 번 발송되지 않도록 하는 단일행 CAS 테이블.
-- GitHub Actions 예약이 드롭될 수 있어 월요일 3회 호출하지만 발송은 1회여야 한다.
-- 재실행 안전(create if not exists / create or replace). 기존 객체를 DROP 하지 않는다.

create table if not exists public.weekly_rank_report_state (
  id boolean primary key default true check (id),
  last_sent_week text null,          -- 발송한 주의 시작일(KST 월요일) 'YYYY-MM-DD'
  last_sent_at timestamptz null,
  updated_at timestamptz not null default now()
);

insert into public.weekly_rank_report_state (id)
values (true)
on conflict (id) do nothing;

-- RLS: 서버 전용(B그룹) — 정책 0개. service role 만 접근.
alter table public.weekly_rank_report_state enable row level security;
revoke all on table public.weekly_rank_report_state from public, anon, authenticated;
grant all on table public.weekly_rank_report_state to service_role;

-- 원자적 선점. 이미 그 주가 발송됐으면 claimed=false 를 돌려준다.
-- for update + is not distinct from(null 안전 비교)이라 동시 호출에서도 정확히 1회만 claimed=true.
create or replace function public.claim_weekly_rank_report(p_week_key text)
returns table(claimed boolean, last_sent_week text)
language plpgsql
security definer
set search_path = public
as $$
declare
  prev text;
begin
  if p_week_key is null or length(p_week_key) = 0 then
    raise exception 'invalid week key';
  end if;

  select s.last_sent_week into prev
  from public.weekly_rank_report_state s
  where s.id = true
  for update;

  if prev is not distinct from p_week_key then
    return query select false, prev;
    return;
  end if;

  update public.weekly_rank_report_state
     set last_sent_week = p_week_key,
         last_sent_at = now(),
         updated_at = now()
   where id = true;

  return query select true, prev;
end;
$$;

-- 발송 실패 시 되돌린다(선점만 하고 못 보낸 주가 영영 막히지 않도록).
create or replace function public.release_weekly_rank_report(p_week_key text, p_prev_week text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.weekly_rank_report_state
     set last_sent_week = p_prev_week,
         last_sent_at = null,
         updated_at = now()
   where id = true
     and last_sent_week = p_week_key;
end;
$$;

revoke all on function public.claim_weekly_rank_report(text) from public, anon, authenticated;
revoke all on function public.release_weekly_rank_report(text, text) from public, anon, authenticated;
grant execute on function public.claim_weekly_rank_report(text) to service_role;
grant execute on function public.release_weekly_rank_report(text, text) to service_role;
