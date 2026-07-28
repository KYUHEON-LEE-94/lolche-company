-- ============================================================================
-- 중복 멤버 병합 (1회성 데이터 보정 — 스키마 변경 아님)
--
-- 배경: 디스코드 로그인 도입 전에 등록된 행이 이미 있었는데, 같은 사람이
--       디스코드로 새로 로그인하면서 다른 라이엇 ID로 자가 등록해 members 가 2행이 됐다.
--       다중 계정(riot_accounts)을 지원하므로 한 사람 = 한 행으로 되돌린다.
--
--   유지(KEEP) : a4ee646b-2df0-472b-bf12-401d5f1205f0
--                뒤틀린황천의응애아기롤체어린이#롤체악귀 (MASTER I 492)
--                └ hall_of_fame 2 · member_rank_history 42 · tft_match_participants 369 · sync_logs 24
--   흡수(DROP) : b68fd6f8-1855-47f0-8e8d-6086229142ca
--                롤토체스 마빵단#KR1 (CHALLENGER I 1024)
--                └ discord_id/user_id 보유 · rank_history 1 · match_participants 5 · sync_logs 1
--
--   ★ 기존 행을 남기는 이유: hall_of_fame 이 KEEP 을 참조한다.
--     DROP 을 남기면 명예의 전당 기록이 member_id=null 로 끊긴다.
--   ★ 대표 계정은 롤체악귀(KEEP 의 slot 1)로 유지한다 — 사용자 확정.
--     마빵단은 slot 2 부계정으로 들어가며 공개 랭킹에 노출되지 않는다.
--
-- 사전 확인 완료(실측):
--   - 두 멤버가 공유하는 match_id 0건 → STEP 3 이관 시 유니크 충돌 없음
--   - DROP 의 hall_of_fame 0건 → 잃는 명예의 전당 기록 없음
--   - KEEP 의 account_no 는 1 뿐 → slot 2 비어 있음
--
-- 실행 위치: Supabase 대시보드 → SQL Editor
-- ⚠ 되돌릴 수 없다. STEP 0 으로 현재 상태를 먼저 캡처해 두라.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- STEP 0. 실행 전 스냅샷 (결과를 복사해 보관할 것)
-- ---------------------------------------------------------------------------
-- select id, member_name, riot_game_name, riot_tagline, status, discord_id, user_id,
--        tft_tier, tft_rank, tft_league_points
--   from public.members
--  where id in ('a4ee646b-2df0-472b-bf12-401d5f1205f0',
--               'b68fd6f8-1855-47f0-8e8d-6086229142ca');
-- select id, member_id, account_no, is_primary, riot_game_name, riot_tagline
--   from public.riot_accounts
--  where member_id in ('a4ee646b-2df0-472b-bf12-401d5f1205f0',
--                      'b68fd6f8-1855-47f0-8e8d-6086229142ca')
--  order by member_id, account_no;

-- ---------------------------------------------------------------------------
-- STEP 1. DROP 의 라이엇 계정을 KEEP 의 slot 2 부계정으로 이관
--   ⚠ is_primary = false 를 반드시 함께 준다.
--     riot_accounts_primary_uidx (member_id) where is_primary 가 비지연 부분 유니크라
--     true 인 채로 옮기면 KEEP 의 대표(slot 1)와 충돌해 23505 로 실패한다.
-- ---------------------------------------------------------------------------
update public.riot_accounts
   set member_id  = 'a4ee646b-2df0-472b-bf12-401d5f1205f0',
       account_no = 2,
       is_primary = false
 where member_id = 'b68fd6f8-1855-47f0-8e8d-6086229142ca';

-- ---------------------------------------------------------------------------
-- STEP 2. 로그인 연결(discord_id / user_id)을 KEEP 으로 이관
--   members_discord_id_key / members_user_id_key 가 부분 유니크이므로
--   DROP 에서 먼저 떼어낸 뒤 KEEP 에 붙인다. 순서를 바꾸면 23505.
--   member_name 은 두 행이 동일('뒤틀린황천의응애아기롤체어린이 03')하므로 건드리지 않는다.
-- ---------------------------------------------------------------------------
update public.members
   set discord_id = null,
       user_id    = null
 where id = 'b68fd6f8-1855-47f0-8e8d-6086229142ca';

update public.members
   set discord_id = '1462366681425903786',
       user_id    = 'a8737e77-d7da-444c-b52e-e639ef0e59b9'
 where id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0';

-- ---------------------------------------------------------------------------
-- STEP 3. 자식 기록 이관 (사용자 확정: 삭제하지 않고 보존)
--   hall_of_fame 은 DROP 에 0건이라 대상 없음.
--   custom_game_* / steam_owned_games 도 양쪽 0건.
-- ---------------------------------------------------------------------------
update public.member_rank_history
   set member_id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0'
 where member_id = 'b68fd6f8-1855-47f0-8e8d-6086229142ca';

update public.tft_match_participants
   set member_id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0'
 where member_id = 'b68fd6f8-1855-47f0-8e8d-6086229142ca';

update public.sync_logs
   set member_id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0'
 where member_id = 'b68fd6f8-1855-47f0-8e8d-6086229142ca';

-- ---------------------------------------------------------------------------
-- STEP 4. 빈 껍데기가 된 DROP 행 삭제
--   여기까지 왔으면 DROP 을 참조하는 자식이 남아 있지 않다.
--   혹시 남아 있으면 FK 가 막거나(에러) SET NULL 로 끊기므로 STEP 5 로 반드시 확인한다.
-- ---------------------------------------------------------------------------
delete from public.members
 where id = 'b68fd6f8-1855-47f0-8e8d-6086229142ca';

commit;

-- ---------------------------------------------------------------------------
-- STEP 5. 검증 (commit 이후 실행)
-- ---------------------------------------------------------------------------
-- (1) DROP 행이 사라졌는가 — 0 rows
-- select id from public.members where id = 'b68fd6f8-1855-47f0-8e8d-6086229142ca';

-- (2) KEEP 이 계정 2개를 갖고, 대표가 롤체악귀인가 — 2 rows, slot1 만 is_primary
-- select account_no, is_primary, riot_game_name, riot_tagline, tft_tier, tft_league_points
--   from public.riot_accounts
--  where member_id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0'
--  order by account_no;

-- (3) 로그인 연결이 KEEP 으로 옮겨졌는가 — 1 row
-- select id, member_name, discord_id, user_id, status
--   from public.members where discord_id = '1462366681425903786';

-- (4) ★ 랭킹 캐시가 대표 계정과 일치하는가 — 0 rows 여야 한다
--     불일치하면 아래 STEP 6 을 실행한다.
-- select m.member_name, m.tft_tier as cached, r.tft_tier as primary_actual
--   from public.members m
--   join public.member_primary_account r on r.member_id = m.id
--  where m.id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0'
--    and (m.tft_tier is distinct from r.tft_tier
--      or m.tft_league_points is distinct from r.tft_league_points);

-- (5) 명예의 전당 보존 확인 — 2 rows (solo MASTER 839 / doubleup BRONZE 93)
-- select queue_type, tier, rank, lp, member_name_snapshot
--   from public.hall_of_fame
--  where member_id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0';

-- (6) 이관된 자식 수 — rank_history 43 / match_participants 374 / sync_logs 25
-- select
--   (select count(*) from public.member_rank_history    where member_id='a4ee646b-2df0-472b-bf12-401d5f1205f0') as rank_history,
--   (select count(*) from public.tft_match_participants where member_id='a4ee646b-2df0-472b-bf12-401d5f1205f0') as matches,
--   (select count(*) from public.sync_logs             where member_id='a4ee646b-2df0-472b-bf12-401d5f1205f0') as logs;

-- (7) 전체 정합성 — 멤버당 계정 4개 이상 0건, 대표 2개 이상 0건
-- select member_id, count(*) from public.riot_accounts group by 1 having count(*) > 3;
-- select member_id, count(*) from public.riot_accounts where is_primary group by 1 having count(*) > 1;

-- ---------------------------------------------------------------------------
-- STEP 6. (검증 4가 불일치일 때만) 랭킹 캐시 재기록
--   members.tft_* 는 대표 계정 값의 비정규화 캐시다.
--   이번 병합은 대표를 바꾸지 않으므로 원래 일치해야 하지만, 어긋났다면 여기서 맞춘다.
--   ⚠ 앱에서는 이 미러링을 lib/members/primaryAccount.ts 의 mirrorPrimaryToMember() 한 곳에서만 한다.
--     아래는 그 로직의 SQL 등가물이며 1회성 보정 용도다.
-- ---------------------------------------------------------------------------
-- update public.members m
--    set riot_game_name = r.riot_game_name,
--        riot_tagline   = r.riot_tagline,
--        riot_puuid     = r.riot_puuid,
--        tft_tier = r.tft_tier, tft_rank = r.tft_rank,
--        tft_league_points = r.tft_league_points,
--        tft_wins = r.tft_wins, tft_losses = r.tft_losses,
--        tft_doubleup_tier = r.tft_doubleup_tier,
--        tft_doubleup_rank = r.tft_doubleup_rank,
--        tft_doubleup_league_points = r.tft_doubleup_league_points,
--        tft_doubleup_wins = r.tft_doubleup_wins,
--        tft_doubleup_losses = r.tft_doubleup_losses
--   from public.member_primary_account r
--  where r.member_id = m.id
--    and m.id = 'a4ee646b-2df0-472b-bf12-401d5f1205f0';

-- ============================================================================
-- 롤백 불가. 실패 시 STEP 0 스냅샷으로 수동 복구해야 한다.
-- (begin/commit 으로 감쌌으므로 중간 실패 시에는 전체가 롤백된다)
-- ============================================================================
