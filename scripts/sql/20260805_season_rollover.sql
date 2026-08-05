-- ============================================================================
-- TFT 시즌 원클릭 전환
-- 실행 위치: Supabase Dashboard > SQL Editor
-- 실행 순서: 코드 배포 전에 이 SQL을 먼저 적용한다.
-- ============================================================================

-- STEP 0. 사전 확인: 결과가 0 또는 1이어야 한다.
-- select count(*) from public.seasons where is_active = true;

-- 활성 시즌은 최대 하나만 존재해야 한다.
create unique index if not exists seasons_one_active_uniq
  on public.seasons (is_active)
  where is_active = true;

drop function if exists public.rollover_tft_season(bigint, text, integer, timestamptz);

create or replace function public.rollover_tft_season(
  p_current_season_id bigint,
  p_confirmation text,
  p_next_season_name text,
  p_next_set_number integer,
  p_start_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.seasons%rowtype;
  v_existing_next public.seasons%rowtype;
  v_next public.seasons%rowtype;
  v_solo_count integer := 0;
  v_doubleup_count integer := 0;
  v_now timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtext('public.rollover_tft_season'));

  if p_current_season_id is null or p_current_season_id <= 0 then
    raise exception '현재 시즌 ID가 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_next_season_name is null
     or char_length(btrim(p_next_season_name)) = 0
     or char_length(btrim(p_next_season_name)) > 60 then
    raise exception '다음 시즌 이름은 1~60자로 입력하세요.' using errcode = '22023';
  end if;
  if p_next_set_number is null or p_next_set_number < 1 or p_next_set_number > 999 then
    raise exception '다음 세트 번호는 1~999의 정수여야 합니다.' using errcode = '22023';
  end if;
  if p_start_at is null then
    raise exception '다음 시즌 시작 시각이 필요합니다.' using errcode = '22023';
  end if;

  select * into v_current
    from public.seasons
   where id = p_current_season_id
   for update;

  if not found then
    raise exception '현재 시즌을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;

  if p_confirmation is null or btrim(p_confirmation) <> v_current.season_name then
    raise exception '현재 시즌 이름을 정확히 입력하세요.' using errcode = '22023';
  end if;

  -- 동일 요청 재시도: 이미 현재 시즌이 닫히고 요청한 다음 시즌이 활성화된 경우 성공으로 응답한다.
  if not v_current.is_active then
    select * into v_existing_next
      from public.seasons
     where set_number = p_next_set_number
       and is_active = true
     order by id desc
     limit 1;

    if found then
      return jsonb_build_object(
        'status', 'already_completed',
        'previous_season_id', v_current.id,
        'next_season_id', v_existing_next.id,
        'next_season_name', v_existing_next.season_name,
        'solo_count', (select count(*) from public.hall_of_fame where season_id = v_current.id and queue_type = 'solo'),
        'doubleup_count', (select count(*) from public.hall_of_fame where season_id = v_current.id and queue_type = 'doubleup')
      );
    end if;

    raise exception '선택한 시즌은 이미 종료되었습니다.' using errcode = '55000';
  end if;

  if p_next_set_number <= v_current.set_number then
    raise exception '다음 세트 번호는 현재 세트 번호보다 커야 합니다.' using errcode = '22023';
  end if;

  if exists (select 1 from public.seasons where set_number = p_next_set_number) then
    raise exception '같은 세트 번호의 시즌이 이미 존재합니다.' using errcode = '23505';
  end if;

  -- 수동 아카이브가 한 큐만 완료된 부분 상태도 트랜잭션 안에서 전체 스냅샷으로 재구성한다.
  delete from public.hall_of_fame where season_id = v_current.id;

  insert into public.hall_of_fame (
    season_id, member_id, queue_type, member_name_snapshot, profile_image_snapshot,
    tier, rank, lp, wins
  )
  select
    v_current.id, m.id, 'solo', m.member_name, m.profile_image_path,
    m.tft_tier, m.tft_rank, m.tft_league_points, 0
  from public.members m
  where m.status = 'approved' and m.tft_tier is not null;
  get diagnostics v_solo_count = row_count;

  insert into public.hall_of_fame (
    season_id, member_id, queue_type, member_name_snapshot, profile_image_snapshot,
    tier, rank, lp, wins
  )
  select
    v_current.id, m.id, 'doubleup', m.member_name, m.profile_image_path,
    m.tft_doubleup_tier, m.tft_doubleup_rank, m.tft_doubleup_league_points, 0
  from public.members m
  where m.status = 'approved' and m.tft_doubleup_tier is not null;
  get diagnostics v_doubleup_count = row_count;

  if v_solo_count = 0 and v_doubleup_count = 0 then
    raise exception '아카이브할 TFT 랭크 데이터가 없습니다.' using errcode = '55000';
  end if;

  update public.seasons
     set is_active = false,
         end_date = v_now
   where id = v_current.id;

  insert into public.seasons (season_name, set_number, is_active, start_date, end_date)
  values (btrim(p_next_season_name), p_next_set_number, true, p_start_at, null)
  returning * into v_next;

  return jsonb_build_object(
    'status', 'completed',
    'previous_season_id', v_current.id,
    'next_season_id', v_next.id,
    'next_season_name', v_next.season_name,
    'solo_count', v_solo_count,
    'doubleup_count', v_doubleup_count
  );
end;
$$;

revoke all on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) from public;
revoke all on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) from anon;
revoke all on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) from authenticated;
grant execute on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) to service_role;
