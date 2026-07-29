-- ============================================================================
-- 20260734_custom_game_reminder.sql
--   내전 "시작 임박" 디스코드 알림의 중복 발송 방지 컬럼.
--   시작 30분 이내 & reminder_sent_at is null 인 모집 중 내전에 알림을 1회 보내고
--   여기에 발송 시각을 기록한다. 크론이 자주 돌아도 내전당 알림은 1번뿐이다.
--   실행 위치: Supabase 대시보드 → SQL Editor
-- ============================================================================

alter table public.custom_games
  add column if not exists reminder_sent_at timestamptz;

-- 조회 최적화(선택): 미발송 모집 중 내전만 빠르게 스캔.
create index if not exists custom_games_reminder_idx
  on public.custom_games (scheduled_at)
  where status = 'recruiting' and reminder_sent_at is null;

-- 롤백:
--   drop index if exists public.custom_games_reminder_idx;
--   alter table public.custom_games drop column if exists reminder_sent_at;
