-- ============================================================================
-- 20260733_drop_old_team_check.sql
--   롤 내전 팀 슬롯에 외부인(guest_name)을 저장하지 못하고 23514 가 나던 문제 수정.
--
-- 원인: custom_game_teams 원본 DDL(추적 파일에 없음, Supabase 에서 직접 생성)에
--   `check_one_player` CHECK 가 있었다. 이 제약은 member_id / guest_id 만 세고
--   guest_name 을 모른다 — 즉 "member_id 또는 guest_id 중 하나는 non-null" 을 강제한다.
--   20260732 가 guest_name 을 포함한 custom_game_teams_identity_chk 로 대체했지만
--   옛 check_one_player 를 drop 하지 않아 둘이 공존했고, 외부인 전용 슬롯
--   (member_id·guest_id 모두 null, guest_name 만 non-null)이 옛 제약에 걸려
--   저장이 23514 로 막혔다. 앱은 이 23514 를 "마이그레이션 미적용"으로 오인해
--   "롤 내전 기능이 아직 활성화되지 않았습니다" 배너를 띄운다.
--
-- 해결: 옛 check_one_player 를 제거한다. 슬롯 정체성은 20260732 의
--   custom_game_teams_identity_chk (member_id/guest_id/guest_name 중 정확히 하나)가
--   이미 담당하므로 무결성 손실이 없다.
--
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- 전제: 20260731 / 20260732 적용 완료.
-- ============================================================================

-- STEP 0. 사전 확인 (읽기 전용) — 두 제약이 공존하는지
-- select conname from pg_constraint
--  where conrelid = 'public.custom_game_teams'::regclass and contype = 'c'
--  order by conname;
--   → check_one_player, custom_game_teams_identity_chk, custom_game_teams_guest_name_chk,
--     custom_game_teams_position_chk 가 보인다.

-- STEP 1. 옛 제약 제거 (identity_chk 로 대체됨)
alter table public.custom_game_teams drop constraint if exists check_one_player;

-- STEP 2. 검증
--   외부인 전용 슬롯 insert 가 통과해야 한다(아래는 존재하지 않는 game_id 라 FK 로 롤백됨 — CHECK 통과만 확인):
-- begin;
--   insert into public.custom_game_teams (custom_game_id, round_number, team_index, guest_name)
--   values ('00000000-0000-0000-0000-000000000000', 1, 1, '외부인테스트');  -- CHECK 통과, FK 23503 이면 정상
-- rollback;
--   member_id + guest_name 동시 → 여전히 23514(identity_chk) 여야 한다.

-- 롤백: 원본 check_one_player 정의를 모르면 복원 불가하나,
--   identity_chk 가 더 강한 제약이므로 복원 불필요.
