-- SQL Editor 적용 순서: 이 파일 먼저, 애플리케이션 배포 나중.
alter table public.profile_frames add column if not exists price_points integer not null default 0 check (price_points >= 0);
alter table public.profile_frames add column if not exists is_purchasable boolean not null default true;
alter table public.members add column if not exists ranking_card_effect_key text null;

create table if not exists public.point_accounts (
  member_id uuid primary key references public.members(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0), updated_at timestamptz not null default now()
);
create table if not exists public.point_ledger (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null check (reason in ('daily_login','custom_game_participation','cosmetic_purchase','admin_adjustment')),
  reference_key text not null, description text null,
  balance_after integer not null check (balance_after >= 0), created_at timestamptz not null default now(),
  unique (member_id, reason, reference_key)
);
create index if not exists point_ledger_member_created_idx on public.point_ledger(member_id, created_at desc);
create index if not exists point_ledger_reason_created_idx on public.point_ledger(reason, created_at desc);

create table if not exists public.ranking_card_effects (
  id uuid primary key default gen_random_uuid(), key text unique not null check (key ~ '^[a-z0-9_-]{1,40}$'),
  label text not null check (char_length(btrim(label)) between 1 and 50),
  description text null check (description is null or char_length(description) <= 200),
  effect_key text unique not null check (effect_key in ('aurora_glow','hex_grid','starfield')),
  price_points integer not null check (price_points >= 0), is_active boolean not null default true,
  is_purchasable boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), created_by uuid null references auth.users(id) on delete set null
);
create table if not exists public.member_frame_inventory (
  member_id uuid not null references public.members(id) on delete cascade,
  frame_id uuid not null references public.profile_frames(id) on delete restrict,
  purchased_at timestamptz not null default now(), price_paid integer not null check(price_paid >= 0), primary key(member_id,frame_id)
);
create table if not exists public.member_rank_effect_inventory (
  member_id uuid not null references public.members(id) on delete cascade,
  effect_id uuid not null references public.ranking_card_effects(id) on delete restrict,
  purchased_at timestamptz not null default now(), price_paid integer not null check(price_paid >= 0), primary key(member_id,effect_id)
);

alter table public.point_accounts enable row level security;
alter table public.point_ledger enable row level security;
alter table public.ranking_card_effects enable row level security;
alter table public.member_frame_inventory enable row level security;
alter table public.member_rank_effect_inventory enable row level security;
revoke all on public.point_accounts, public.point_ledger, public.ranking_card_effects, public.member_frame_inventory, public.member_rank_effect_inventory from public, anon, authenticated;
grant select,insert,update,delete on public.point_accounts, public.point_ledger, public.ranking_card_effects, public.member_frame_inventory, public.member_rank_effect_inventory to service_role;
grant usage,select on sequence public.point_ledger_id_seq to service_role;

insert into public.profile_frames(key,label,image_path,is_active,sort_order,price_points,is_purchasable)
values ('celestial_crystal','천상의 수정','/frames/generated/celestial-crystal.png',true,200,200,true),
       ('volcanic_ember','화산의 불씨','/frames/generated/volcanic-ember.png',true,350,350,true)
on conflict(key) do nothing;
insert into public.ranking_card_effects(key,label,description,effect_key,price_points,sort_order)
values ('aurora_glow','오로라 글로우','은은한 오로라 빛', 'aurora_glow',150,100),
('hex_grid','헥스 그리드','기하학 격자 효과','hex_grid',300,200),
('starfield','스타필드','별빛 배경 효과','starfield',500,300)
on conflict(key) do nothing;

insert into public.member_frame_inventory(member_id,frame_id,price_paid)
select m.id,f.id,0 from public.members m join public.profile_frames f on f.image_path=m.profile_frame_path
where m.profile_frame_path is not null on conflict do nothing;

create or replace function public.claim_daily_login_points(p_member_id uuid)
returns table(awarded boolean,balance integer) language plpgsql security definer set search_path='' as $$
declare v_ref text := ((pg_catalog.now() at time zone 'Asia/Seoul')::date)::text; v_balance integer;
begin
  if not exists(select 1 from public.members where id=p_member_id and status='approved') then raise exception 'member_not_approved'; end if;
  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id=p_member_id for update;
  begin
    insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after)
    values(p_member_id,10,'daily_login',v_ref,'Discord 일일 로그인',v_balance+10);
  exception when unique_violation then return query select false,v_balance; return; end;
  update public.point_accounts set balance=v_balance+10,updated_at=pg_catalog.now() where member_id=p_member_id;
  return query select true,v_balance+10;
end $$;

create or replace function public.claim_custom_game_participation_points(p_game_id uuid,p_member_id uuid)
returns table(awarded boolean,balance integer) language plpgsql security definer set search_path='' as $$
declare v_balance integer; v_ref text := p_game_id::text;
begin
  if not exists(select 1 from public.custom_game_participants where custom_game_id=p_game_id and member_id=p_member_id) then raise exception 'participation_not_found'; end if;
  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id=p_member_id for update;
  begin insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after)
    values(p_member_id,10,'custom_game_participation',v_ref,'내전 최초 참가',v_balance+10);
  exception when unique_violation then return query select false,v_balance; return; end;
  update public.point_accounts set balance=v_balance+10,updated_at=pg_catalog.now() where member_id=p_member_id;
  return query select true,v_balance+10;
end $$;

create or replace function public.purchase_profile_frame(p_member_id uuid,p_frame_id uuid)
returns table(status text,balance integer) language plpgsql security definer set search_path='' as $$
declare v_price integer; v_balance integer;
begin
  select price_points into v_price from public.profile_frames where id=p_frame_id and is_active and is_purchasable;
  if not found then return query select 'not_found'::text,0; return; end if;
  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id=p_member_id for update;
  if exists(select 1 from public.member_frame_inventory where member_id=p_member_id and frame_id=p_frame_id) then return query select 'owned'::text,v_balance; return; end if;
  if v_balance<v_price then return query select 'insufficient'::text,v_balance; return; end if;
  insert into public.member_frame_inventory values(p_member_id,p_frame_id,pg_catalog.now(),v_price);
  if v_price>0 then insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after) values(p_member_id,-v_price,'cosmetic_purchase','frame:'||p_frame_id::text,'프레임 구매',v_balance-v_price); end if;
  update public.point_accounts set balance=v_balance-v_price,updated_at=pg_catalog.now() where member_id=p_member_id;
  return query select 'purchased'::text,v_balance-v_price;
end $$;

create or replace function public.purchase_rank_effect(p_member_id uuid,p_effect_id uuid)
returns table(status text,balance integer) language plpgsql security definer set search_path='' as $$
declare v_price integer; v_balance integer;
begin
  select price_points into v_price from public.ranking_card_effects where id=p_effect_id and is_active and is_purchasable;
  if not found then return query select 'not_found'::text,0; return; end if;
  insert into public.point_accounts(member_id) values(p_member_id) on conflict do nothing;
  select a.balance into v_balance from public.point_accounts a where a.member_id=p_member_id for update;
  if exists(select 1 from public.member_rank_effect_inventory where member_id=p_member_id and effect_id=p_effect_id) then return query select 'owned'::text,v_balance; return; end if;
  if v_balance<v_price then return query select 'insufficient'::text,v_balance; return; end if;
  insert into public.member_rank_effect_inventory values(p_member_id,p_effect_id,pg_catalog.now(),v_price);
  if v_price>0 then insert into public.point_ledger(member_id,amount,reason,reference_key,description,balance_after) values(p_member_id,-v_price,'cosmetic_purchase','effect:'||p_effect_id::text,'랭킹 효과 구매',v_balance-v_price); end if;
  update public.point_accounts set balance=v_balance-v_price,updated_at=pg_catalog.now() where member_id=p_member_id;
  return query select 'purchased'::text,v_balance-v_price;
end $$;

revoke all on function public.claim_daily_login_points(uuid),public.claim_custom_game_participation_points(uuid,uuid),public.purchase_profile_frame(uuid,uuid),public.purchase_rank_effect(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_daily_login_points(uuid),public.claim_custom_game_participation_points(uuid,uuid),public.purchase_profile_frame(uuid,uuid),public.purchase_rank_effect(uuid,uuid) to service_role;

-- 검증: anon/authenticated는 신규 표/RPC에 접근 불가, service_role만 접근 가능해야 한다.
-- 롤백(원장 데이터 삭제 주의): 신규 함수/표를 역순으로 drop하고 members/profile_frames 추가 컬럼을 drop한다.
