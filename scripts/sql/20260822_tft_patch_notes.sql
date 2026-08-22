-- 현재 TFT 시즌에만 귀속되는 관리자 작성 패치 노트
create table if not exists public.tft_patch_notes (
  id uuid primary key default gen_random_uuid(),
  season_id bigint not null references public.seasons(id) on delete cascade,
  title varchar(120) not null check (char_length(btrim(title)) between 1 and 120),
  summary varchar(300) not null default '' check (char_length(summary) <= 300),
  content text not null check (char_length(btrim(content)) between 1 and 20000),
  is_published boolean not null default true,
  published_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tft_patch_notes_public_list_idx on public.tft_patch_notes (season_id, is_published, published_at desc, created_at desc);
alter table public.tft_patch_notes enable row level security;
revoke all on table public.tft_patch_notes from anon, authenticated;
grant all on table public.tft_patch_notes to service_role;
