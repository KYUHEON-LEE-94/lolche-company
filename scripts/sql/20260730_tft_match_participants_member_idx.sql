-- tft_match_participants 를 member_id 로 조회하는 경로가 늘어난다
-- (/api/members/[id]/matches, /api/members/[id]/stats).
-- 실행: Supabase SQL Editor. 코드 배포 전에 적용해도 무해하다(순수 인덱스 추가).

create index if not exists tft_match_participants_member_idx
  on public.tft_match_participants (member_id);
