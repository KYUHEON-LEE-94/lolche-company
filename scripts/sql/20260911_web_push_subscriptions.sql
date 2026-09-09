-- ============================================================================
-- 20260911_web_push_subscriptions.sql
--   웹 푸시(Web Push / VAPID) 구독 저장 + 내전 푸시 발송 기록 컬럼.
--   실행 위치: Supabase 대시보드 → SQL Editor. 순서: SQL 먼저 → 배포 나중.
--
--   ⚠ 기존 20260734 의 custom_games.reminder_sent_at(30분 디스코드 채널 알림)과는
--     완전히 독립적인 컬럼이다. 기존 컬럼/인덱스는 건드리지 않는다.
-- ============================================================================

begin;

-- 1) 구독 테이블 ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members(id) on delete cascade,
  endpoint     text not null,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- endpoint 는 브라우저·기기당 유일한 푸시 주소다. 같은 endpoint 가 다른 멤버로
-- 재등록될 수 있으므로(공용 PC 에서 로그아웃 후 다른 사람 로그인) 전역 유니크로 둔다.
create unique index if not exists push_subscriptions_endpoint_uidx
  on public.push_subscriptions (endpoint);

create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (member_id);

-- 2) RLS: 서버 전용 — 정책 0개 (B 그룹) ------------------------------------
--    anon/authenticated 완전 차단. 쓰기는 POST/DELETE /api/me/push-subscription
--    (service role + 세션 소유권)만 수행한다. self-INSERT 정책을 만들면 사용자가
--    콘솔에서 남의 member_id 로 구독을 심어 타인 기기로 알림을 보낼 수 있다.
alter table public.push_subscriptions enable row level security;

-- 3) 내전 푸시 발송 기록 ----------------------------------------------------
alter table public.custom_games
  add column if not exists push_reminder_sent_at timestamptz;

-- status 를 술어에 넣지 않는다 — 푸시 창은 recruiting + in_progress 를 함께 본다.
create index if not exists custom_games_push_reminder_idx
  on public.custom_games (scheduled_at)
  where push_reminder_sent_at is null;

commit;

-- 롤백:
--   drop index if exists public.custom_games_push_reminder_idx;
--   alter table public.custom_games drop column if exists push_reminder_sent_at;
--   drop table if exists public.push_subscriptions;
