-- 시즌 마감 임박 알림용: 예약 종료일 + 알림 발송 여부.
-- 관리자가 예약 종료일을 설정하면, 크론이 N일 전에 디스코드로 1회 알린다.
-- SQL Editor 에서 직접 실행.

alter table public.seasons add column if not exists scheduled_end_at timestamptz null;
alter table public.seasons add column if not exists end_reminder_sent_at timestamptz null;
