-- Supabase SQL Editor에서 이 파일을 먼저 적용한 뒤 애플리케이션을 배포한다.
create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  description text null check (description is null or char_length(description) <= 500),
  event_type text not null check (event_type in ('birthday', 'anniversary', 'event')),
  recurrence text not null default 'none' check (recurrence in ('none', 'yearly')),
  event_date date null,
  event_month smallint not null check (event_month between 1 and 12),
  event_day smallint not null check (
    event_day >= 1 and event_day <= case
      when event_month = 2 then 29
      when event_month in (4, 6, 9, 11) then 30
      else 31 end
  ),
  is_all_day boolean not null default true,
  event_time time without time zone null,
  notification_sent_for date null,
  member_id uuid not null references public.members(id) on delete cascade,
  created_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_shape_check check (
    (recurrence = 'yearly' and event_date is null)
    or (recurrence = 'none' and event_type = 'event' and event_date is not null
      and event_month = extract(month from event_date)::smallint
      and event_day = extract(day from event_date)::smallint)
  ),
  constraint calendar_events_recurring_type_check check (
    event_type = 'event' or recurrence = 'yearly'
  ),
  constraint calendar_events_time_shape_check check (
    (event_type in ('birthday', 'anniversary') and is_all_day = true and event_time is null)
    or (event_type = 'event' and ((is_all_day = true and event_time is null) or (is_all_day = false and event_time is not null)))
  )
);

-- 같은 파일의 초기 버전을 이미 적용한 환경도 안전하게 확장한다.
alter table public.calendar_events add column if not exists is_all_day boolean not null default true;
alter table public.calendar_events add column if not exists event_time time without time zone null;
alter table public.calendar_events add column if not exists notification_sent_for date null;
alter table public.calendar_events drop constraint if exists calendar_events_time_shape_check;
alter table public.calendar_events add constraint calendar_events_time_shape_check check (
  (event_type in ('birthday', 'anniversary') and is_all_day = true and event_time is null)
  or (event_type = 'event' and ((is_all_day = true and event_time is null) or (is_all_day = false and event_time is not null)))
);

create index if not exists calendar_events_once_date_idx on public.calendar_events (event_date) where recurrence = 'none';
create index if not exists calendar_events_yearly_month_day_idx on public.calendar_events (event_month, event_day, id) where recurrence = 'yearly';
create index if not exists calendar_events_member_idx on public.calendar_events (member_id);
create index if not exists calendar_events_notification_candidates_idx on public.calendar_events (event_date, event_month, event_day) where event_type = 'event';

alter table public.calendar_events enable row level security;
revoke all on table public.calendar_events from public, anon, authenticated;
grant select, insert, update, delete on table public.calendar_events to service_role;

-- 검증: select relrowsecurity from pg_class where oid='public.calendar_events'::regclass;
-- 검증: select grantee, privilege_type from information_schema.role_table_grants where table_schema='public' and table_name='calendar_events';
-- 롤백(데이터가 모두 삭제되므로 필요할 때만 실행): drop table public.calendar_events;
