-- ============================================================================
-- LoL 전용 PUUID 컬럼 (20260729)
-- 배경: Riot PUUID 는 API 키에 종속된 암호문이다. TFT 키로 받은 puuid 를
--       LoL 엔드포인트에 넣으면 400 'Exception decrypting' 이 반환된다.
--       따라서 LoL 키로 account-v1 을 따로 호출해 얻은 puuid 를 별도 보관한다.
-- ⚠ 기존 데이터 백필 불가 — LoL 키로 API 를 호출해야만 얻는 값이다.
--    전 행 null 로 시작하고 동기화(doSyncMember)가 대표 계정부터 채운다.
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ============================================================================

-- STEP 0. 사전 확인 (읽기 전용)
-- select column_name from information_schema.columns
--  where table_schema='public' and table_name='riot_accounts' and column_name='lol_puuid';  -- 0 rows

-- ---------------------------------------------------------------------------
-- STEP 1. 컬럼 추가 (멱등)
--   members 에는 추가하지 않는다. members.lol_* 는 "공개 랭킹 표시용 캐시"이며
--   lol_puuid 는 표시 대상이 아니고, 대표 계정 전환 시 stale 위험만 만든다.
-- ---------------------------------------------------------------------------
alter table public.riot_accounts
  add column if not exists lol_puuid text;

comment on column public.riot_accounts.lol_puuid is
  'LoL 전용 API 키(RIOT_LOL_API_KEY)로 발급받은 PUUID. riot_puuid(TFT 키 기준)와 값이 다르며 교차 사용 시 400. 키 교체 시 전부 무효 → 400 발생하면 자동 재발급.';

-- ---------------------------------------------------------------------------
-- STEP 2. 인덱스 — 의도적으로 만들지 않는다
--   (a) 유니크: 계정 선점 방어는 riot_accounts_riotid_uidx / riot_accounts_puuid_uidx 가
--       이미 담당한다. lol_puuid 에 유니크를 걸면 키 교체 과도기에 23505 로
--       LoL 동기화가 조용히 실패할 뿐 얻는 방어가 없다.
--   (b) 일반 인덱스: lol_puuid 를 WHERE 조건으로 쓰는 쿼리가 앱에 존재하지 않는다.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- STEP 3. 검증
-- ---------------------------------------------------------------------------
-- (1) select column_name, data_type, is_nullable from information_schema.columns
--      where table_schema='public' and table_name='riot_accounts' and column_name='lol_puuid';
-- (2) 마이그레이션 직후 전 행 null — total 과 filled 비교
-- select count(*) as total, count(lol_puuid) as filled from public.riot_accounts;
-- (3) 최초 동기화 후 대표 계정 행이 채워졌는지
-- select m.member_name, r.account_no, r.is_primary,
--        (r.riot_puuid is not null) as has_tft_puuid,
--        (r.lol_puuid  is not null) as has_lol_puuid,
--        r.lol_tier, r.lol_synced_at
--   from public.riot_accounts r join public.members m on m.id = r.member_id
--  order by m.member_name, r.account_no;
-- (4) ★ 두 puuid 가 같은 행이 있으면 키 설정 오류 — 0 rows 여야 한다
-- select id, member_id from public.riot_accounts
--  where lol_puuid is not null and lol_puuid = riot_puuid;
-- (5) members 캐시와 대표 계정 lol_tier 일치 — 0 rows
-- select m.member_name, m.lol_tier, r.lol_tier
--   from public.members m join public.member_primary_account r on r.member_id = m.id
--  where m.lol_tier is distinct from r.lol_tier;

-- 롤백:
--   alter table public.riot_accounts drop column if exists lol_puuid;
--   (members.* 캐시·riot_puuid 는 무변경이므로 TFT/내전 기능에 영향 없음)
