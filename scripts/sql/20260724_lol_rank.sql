-- 20260724_lol_rank.sql — LoL 솔로랭크 캐시 컬럼 추가 (Phase 4)
--
-- ⚠ Analyst 계획(01_analyst_plan.md)은 이 컬럼들을 riot_accounts 테이블에 두는 안이었으나
--   Phase 2(riot_accounts 정규화)가 아직 미구현이다. 따라서 지금은 tft_* 와 같은 위치,
--   즉 public.members 에 둔다.
--   Phase 2 진행 시 lol_* 는 tft_* 와 함께 riot_accounts 로 이동하고,
--   members.lol_* 는 "대표 계정 값의 비정규화 캐시"로 미러링된다.
--
-- 실행: Supabase SQL Editor 에서 직접 실행 (SQL 먼저 → 배포 나중)

alter table public.members
  add column if not exists lol_tier text,
  add column if not exists lol_rank text,
  add column if not exists lol_league_points int,
  add column if not exists lol_wins int,
  add column if not exists lol_losses int,
  add column if not exists lol_synced_at timestamptz;

-- 검증
-- select column_name, data_type from information_schema.columns
--  where table_schema = 'public' and table_name = 'members' and column_name like 'lol_%';
