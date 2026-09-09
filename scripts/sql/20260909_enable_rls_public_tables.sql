-- 20260909_enable_rls_public_tables.sql
-- 치명적 보안 수정: RLS-off public 테이블 14개에 RLS 적용.
--   A 그룹(공개/브라우저가 anon 으로 SELECT): enable RLS + select using(true)
--                                            (write 정책 없음 → 쓰기 차단, 서버는 service role 로 우회)
--   B 그룹(서버 전용): enable RLS + 정책 0개 (anon/authenticated 완전 차단, service role 만 접근)
--
-- ⚠ 이미 RLS on 인 테이블(riot_accounts / custom_games / custom_game_participants /
--   steam_* / calendar_* / point_* / patch_notes / inventory·title·theme 등)은 절대 건드리지 않는다.
--
-- 실행법: Supabase Dashboard → SQL Editor 에 이 파일 전체를 붙여넣어 직접 실행한다.
-- 순서: 코드 배포 먼저 → SQL 나중.
--   createSeasonAction(서버 액션)이 배포된 뒤 이 SQL 을 실행해야 시즌 "생성"에 회귀 창이 없다.
--   (SQL 을 먼저 켜면 배포 전까지 관리자 시즌 생성만 일시 실패. 읽기/다른 조작은 정상.)
--
-- 재실행 안전(idempotent): enable RLS 는 멱등(이미 켜져 있으면 no-op),
--   정책은 drop policy if exists → create policy. 존재하지 않는 테이블은 if exists 로 무해 통과.

begin;

------------------------------------------------------------
-- A 그룹: anon/브라우저가 직접 SELECT 하므로 공개 읽기 정책 부여
------------------------------------------------------------
alter table if exists public.members         enable row level security;
alter table if exists public.seasons         enable row level security;
alter table if exists public.profile_frames  enable row level security;

drop policy if exists members_select_all        on public.members;
create policy members_select_all        on public.members        for select to anon, authenticated using (true);

drop policy if exists seasons_select_all        on public.seasons;
create policy seasons_select_all        on public.seasons        for select to anon, authenticated using (true);

drop policy if exists profile_frames_select_all on public.profile_frames;
create policy profile_frames_select_all on public.profile_frames for select to anon, authenticated using (true);

------------------------------------------------------------
-- B 그룹: service role 전용 — 정책 0개 (anon/authenticated 전면 차단)
-- service role 은 RLS 를 우회하므로 서버 라우트/Sync 로직은 그대로 동작한다.
------------------------------------------------------------
-- admins: 브라우저는 더 이상 이 테이블을 직접 읽지 않는다(AuthButtons → GET /api/admin/me).
--         공개 select 정책을 두지 않아 anon/authenticated 는 관리자 명단을 조회할 수 없다.
alter table if exists public.admins                    enable row level security;
drop policy if exists admins_select_all                on public.admins;  -- 이전 실행이 만든 공개 select 제거(재실행 안전)

alter table if exists public.hall_of_fame              enable row level security;
alter table if exists public.tft_matches               enable row level security;
alter table if exists public.tft_match_participants    enable row level security;
alter table if exists public.member_rank_history       enable row level security;
alter table if exists public.sync_logs                 enable row level security;
alter table if exists public.custom_game_rounds        enable row level security;
alter table if exists public.custom_game_results       enable row level security;
alter table if exists public.custom_game_guests        enable row level security;
alter table if exists public.custom_game_guest_results enable row level security;
alter table if exists public.custom_game_teams         enable row level security;

commit;
