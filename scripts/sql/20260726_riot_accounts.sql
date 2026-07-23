-- ============================================================================
-- 다중 라이엇 계정(최대 3) + 대표 계정 마이그레이션
-- 실행 위치: Supabase 대시보드 → SQL Editor (자동 실행되지 않음)
--   STEP 0 사전 확인 / 1 테이블 / 2 제약 / 3 백필 / 4 파생 뷰 /
--   5 대표전환 RPC / 6 RLS / 7 보조 트리거 / 8 검증
-- 이 파일 실행 전에 앱을 배포해도 죽지는 않지만(테이블 부재 degrade 처리),
-- 다중 계정 기능은 "마이그레이션 필요" 안내만 뜨고 동작하지 않는다.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- STEP 0. 사전 확인 (읽기 전용)
-- ---------------------------------------------------------------------------
-- 0-1) 20260723 STEP 6(선택)의 Riot ID 유니크 적용 여부 — 적용됐다면 STEP 2와 중복
-- select indexname from pg_indexes
--  where schemaname='public' and tablename='members' and indexname='members_riot_id_key';
-- 0-2) Riot ID 중복
-- select lower(riot_game_name), lower(riot_tagline), count(*)
--   from public.members group by 1,2 having count(*) > 1;
-- 0-3) puuid 중복
-- select riot_puuid, count(*) from public.members
--  where riot_puuid is not null group by 1 having count(*) > 1;
-- 0-4) tagline CHECK 위반 레거시 행 (STEP 3 실패 요인)
--   한글 태그라인은 정상이다. 공백·# 포함 또는 10자 초과인 행만 걸린다.
-- select id, member_name, riot_tagline from public.members
--  where char_length(riot_tagline) not between 1 and 10
--     or riot_tagline ~ '[[:space:]#]';

-- ---------------------------------------------------------------------------
-- STEP 1. riot_accounts 테이블
--   members.riot_* / tft_* / lol_* 는 삭제하지 않는다.
--   → 대표 계정 값의 "비정규화 캐시"로 계속 사용한다 (공개 쿼리 무변경의 근거).
-- ---------------------------------------------------------------------------
create table if not exists public.riot_accounts (
  id              uuid primary key default gen_random_uuid(),
  member_id       uuid not null references public.members(id) on delete cascade,

  -- 최대 3개를 "물리적으로" 막는 슬롯 번호
  account_no      smallint not null check (account_no between 1 and 3),
  is_primary      boolean  not null default false,

  riot_game_name  text not null check (char_length(riot_game_name) between 1 and 30),
  -- ⚠ 태그라인을 영문/숫자로 제한하지 않는다.
  --   Riot 은 한글 태그라인을 허용하고 실제 사용 중인 멤버가 있다(예: `딸 깍#쉽다쉬워`).
  --   `~ '^[A-Za-z0-9]{2,10}$'` 로 두면 STEP 3 백필이 23514 로 실패한다.
  --   공백·구분자 `#` 만 거르고 나머지는 길이로만 제한한다 (lib/members/memberInput.ts 와 동일 규칙).
  riot_tagline    text not null check (
                    char_length(riot_tagline) between 1 and 10
                    and riot_tagline !~ '[[:space:]#]'
                  ),
  riot_puuid      text,

  tft_tier                   text,
  tft_rank                   text,
  tft_league_points          integer,
  tft_wins                   integer,
  tft_losses                 integer,
  tft_doubleup_tier          text,
  tft_doubleup_rank          text,
  tft_doubleup_league_points integer,
  tft_doubleup_wins          integer,
  tft_doubleup_losses        integer,

  lol_tier          text,
  lol_rank          text,
  lol_league_points integer,
  lol_wins          integer,
  lol_losses        integer,
  lol_synced_at     timestamptz,

  last_synced_at  timestamptz,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- STEP 2. 제약 — 앱 코드가 아니라 여기서 강제한다
-- ---------------------------------------------------------------------------
-- (a) 최대 3개: 슬롯 유니크가 유일한 원자적 방어선
create unique index if not exists riot_accounts_slot_uidx
  on public.riot_accounts (member_id, account_no);

-- (b) 대표 <=1 (>=1은 STEP 4 뷰가 파생으로 보장)
create unique index if not exists riot_accounts_primary_uidx
  on public.riot_accounts (member_id) where is_primary;

-- (c) 타인 계정 선점/탈취 방지 — 전역 유니크. 위반 시 앱은 23505 → 409
create unique index if not exists riot_accounts_puuid_uidx
  on public.riot_accounts (riot_puuid) where riot_puuid is not null;

create unique index if not exists riot_accounts_riotid_uidx
  on public.riot_accounts (lower(riot_game_name), lower(riot_tagline));

create index if not exists riot_accounts_member_id_idx
  on public.riot_accounts (member_id);

-- ---------------------------------------------------------------------------
-- STEP 3. 기존 데이터 백필 — 현재 모든 멤버를 slot 1 · 대표로 등록 (멱등)
-- ---------------------------------------------------------------------------
insert into public.riot_accounts (
  member_id, account_no, is_primary,
  riot_game_name, riot_tagline, riot_puuid,
  tft_tier, tft_rank, tft_league_points, tft_wins, tft_losses,
  tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_league_points,
  tft_doubleup_wins, tft_doubleup_losses,
  lol_tier, lol_rank, lol_league_points, lol_wins, lol_losses, lol_synced_at,
  last_synced_at
)
select
  m.id, 1, true,
  m.riot_game_name, m.riot_tagline, m.riot_puuid,
  m.tft_tier, m.tft_rank, m.tft_league_points, m.tft_wins, m.tft_losses,
  m.tft_doubleup_tier, m.tft_doubleup_rank, m.tft_doubleup_league_points,
  m.tft_doubleup_wins, m.tft_doubleup_losses,
  m.lol_tier, m.lol_rank, m.lol_league_points, m.lol_wins, m.lol_losses, m.lol_synced_at,
  m.last_synced_at
from public.members m
where not exists (select 1 from public.riot_accounts r where r.member_id = m.id);

-- ---------------------------------------------------------------------------
-- STEP 4. 대표 계정 파생 뷰
--   "대표 없음" 상태를 관측 불가능하게 만든다 → 자동 승격 UPDATE 불필요 = 승격 경합 없음
--   (앱도 동일한 정렬 규칙 is_primary desc, account_no asc 로 대표를 파생한다)
-- ---------------------------------------------------------------------------
create or replace view public.member_primary_account as
select distinct on (member_id) *
  from public.riot_accounts
 order by member_id, is_primary desc, account_no asc;

-- ---------------------------------------------------------------------------
-- STEP 5. 대표 전환 RPC — 부분 유니크 인덱스는 비지연이므로 2문장 트랜잭션
--   p_member_id 가드가 없으면 남의 계정을 대표로 만들 수 있다.
-- ---------------------------------------------------------------------------
create or replace function public.set_primary_riot_account(p_member_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.riot_accounts set is_primary = false
   where member_id = p_member_id and is_primary;

  update public.riot_accounts set is_primary = true
   where id = p_account_id and member_id = p_member_id;

  if not found then
    raise exception 'riot account % not found for member %', p_account_id, p_member_id;
  end if;
end $$;

revoke all on function public.set_primary_riot_account(uuid, uuid) from public, anon, authenticated;
-- service role 만 호출한다 (앱의 모든 쓰기는 서버 라우트 경유)

-- ---------------------------------------------------------------------------
-- STEP 6. RLS — select 정책만. self-INSERT/UPDATE 정책 금지
--   RLS는 행 단위라 컬럼을 제한할 수 없다. UPDATE 정책이 있으면 사용자가 콘솔에서
--   is_primary / tft_tier 를 직접 조작해 재승인 규칙을 통째로 우회한다.
-- ---------------------------------------------------------------------------
alter table public.riot_accounts enable row level security;
drop policy if exists riot_accounts_select_all on public.riot_accounts;
create policy riot_accounts_select_all on public.riot_accounts for select using (true);

-- ---------------------------------------------------------------------------
-- STEP 7. 보조 트리거 (SQL 콘솔 직접 조작 방어용 백업)
--   정확성은 STEP 2(a)의 슬롯 유니크가 담보한다. count(*) 체크는 동시
--   트랜잭션에서 서로를 보지 못하므로 단독 방어선으로 신뢰하지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.riot_accounts_limit_check()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.riot_accounts where member_id = new.member_id) >= 3 then
    raise exception '라이엇 계정은 최대 3개까지 등록할 수 있습니다.';
  end if;
  return new;
end $$;

drop trigger if exists riot_accounts_limit_trg on public.riot_accounts;
create trigger riot_accounts_limit_trg
  before insert on public.riot_accounts
  for each row execute function public.riot_accounts_limit_check();

-- ---------------------------------------------------------------------------
-- STEP 8. 검증
-- ---------------------------------------------------------------------------
-- select count(*) from public.members;                                 -- (1)
-- select count(*) from public.riot_accounts where is_primary;          -- (1)과 같아야 함
-- select member_id, count(*) from public.riot_accounts group by 1 having count(*) > 3;  -- 0 rows
-- select m.member_name, m.tft_tier, r.tft_tier
--   from public.members m join public.member_primary_account r on r.member_id = m.id
--  where m.tft_tier is distinct from r.tft_tier;                       -- 0 rows
-- select polname, polcmd from pg_policy
--  where polrelid = 'public.riot_accounts'::regclass;                   -- select(r) 1건만

-- 롤백:
--   drop trigger if exists riot_accounts_limit_trg on public.riot_accounts;
--   drop function if exists public.riot_accounts_limit_check();
--   drop function if exists public.set_primary_riot_account(uuid, uuid);
--   drop view if exists public.member_primary_account;
--   drop table if exists public.riot_accounts;   -- members.* 캐시는 그대로 남아 무손실
