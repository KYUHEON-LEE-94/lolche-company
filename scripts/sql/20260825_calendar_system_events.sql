-- 홈 달력에 표시할 읽기 전용 시스템 소식 이력입니다.
-- 기존 멤버 calendar_events와 분리해 사용자 CRUD/소유권 규칙을 그대로 유지합니다.
create table if not exists public.calendar_system_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('tft_patch_note', 'steam_deal')),
  source_key text not null check (char_length(source_key) between 1 and 160),
  title text not null check (char_length(title) between 1 and 120),
  description text null check (description is null or char_length(description) <= 300),
  href text not null check (href like '/%' and href not like '//%'),
  event_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  event_time time null,
  created_at timestamptz not null default now()
);

create index if not exists calendar_system_events_event_date_idx
  on public.calendar_system_events (event_date, id);
create index if not exists calendar_system_events_source_key_idx
  on public.calendar_system_events (source, source_key, created_at desc);

alter table public.calendar_system_events enable row level security;
revoke all on table public.calendar_system_events from public, anon, authenticated;
grant select, insert on table public.calendar_system_events to service_role;

create or replace function public.record_tft_patch_note_calendar_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_public_change boolean := false;
  event_title text;
begin
  if not new.is_published then
    return new;
  end if;

  if tg_op = 'INSERT' then
    is_public_change := true;
    event_title := '새 롤체 패치: ' || left(new.title, 100);
  elsif old.is_published is distinct from new.is_published then
    is_public_change := true;
    event_title := '새 롤체 패치: ' || left(new.title, 100);
  elsif old.title is distinct from new.title
    or old.summary is distinct from new.summary
    or old.source_url is distinct from new.source_url
    or old.source_published_at is distinct from new.source_published_at then
    is_public_change := true;
    event_title := '롤체 패치 업데이트: ' || left(new.title, 92);
  end if;

  if is_public_change then
    insert into public.calendar_system_events (source, source_key, title, description, href)
    values (
      'tft_patch_note',
      new.id::text || ':' || extract(epoch from now())::bigint::text,
      left(event_title, 120),
      nullif(left(coalesce(new.summary, ''), 300), ''),
      '/tft'
    );
  end if;
  return new;
end;
$$;

create or replace function public.record_steam_deal_calendar_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  previous jsonb;
  app_id text;
  deal_name text;
  discount text;
  final_price text;
begin
  if new.deals is not distinct from old.deals or jsonb_typeof(new.deals) <> 'array' then
    return new;
  end if;

  for item in select value from jsonb_array_elements(new.deals) loop
    app_id := item ->> 'appid';
    deal_name := nullif(left(btrim(coalesce(item ->> 'name', '')), 100), '');
    discount := item ->> 'discountPercent';
    final_price := item ->> 'finalPrice';
    if app_id is null or app_id !~ '^[1-9][0-9]*$'
      or deal_name is null or discount !~ '^[0-9]{1,3}$' or final_price !~ '^[0-9]+$' then
      continue;
    end if;

    select candidate.value into previous
    from jsonb_array_elements(case when jsonb_typeof(old.deals) = 'array' then old.deals else '[]'::jsonb end) candidate
    where candidate.value ->> 'appid' = app_id
    limit 1;

    if previous is null
      or previous ->> 'name' is distinct from item ->> 'name'
      or previous ->> 'discountPercent' is distinct from item ->> 'discountPercent'
      or previous ->> 'originalPrice' is distinct from item ->> 'originalPrice'
      or previous ->> 'finalPrice' is distinct from item ->> 'finalPrice'
      or previous ->> 'expiresAt' is distinct from item ->> 'expiresAt' then
      insert into public.calendar_system_events (source, source_key, title, description, href)
      values (
        'steam_deal',
        app_id || ':' || extract(epoch from now())::bigint::text,
        left('Steam 할인: ' || deal_name, 120),
        left('-' || discount || '% · ₩' || to_char((final_price::numeric / 100), 'FM999G999G999G990'), 300),
        '/steam'
      );
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists tft_patch_notes_calendar_system_event on public.tft_patch_notes;
create trigger tft_patch_notes_calendar_system_event
after insert or update of title, summary, source_url, source_published_at, is_published on public.tft_patch_notes
for each row execute function public.record_tft_patch_note_calendar_event();

drop trigger if exists steam_deals_calendar_system_event on public.steam_featured_deal_snapshots;
create trigger steam_deals_calendar_system_event
after update of deals on public.steam_featured_deal_snapshots
for each row execute function public.record_steam_deal_calendar_events();

revoke all on function public.record_tft_patch_note_calendar_event() from public, anon, authenticated;
revoke all on function public.record_steam_deal_calendar_events() from public, anon, authenticated;
