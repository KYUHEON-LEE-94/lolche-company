-- 명예의 전당 정산(시즌 롤오버) 시 큐별 상위 3위에게 포인트 지급.
-- 1위 100 / 2위 50 / 3위 20, 솔로·더블업 각각.
-- ★ 동점(같은 tier/rank/lp)이라 이름순으로 위치가 갈린 경우는 지급하지 않는다
--   (해당 위치의 점수가 유일할 때만 지급 = tie_count = 1).
-- SQL Editor 에서 직접 실행. 코드 배포와 독립적(RPC/제약만 교체).

-- 1) point_ledger reason 에 'hall_of_fame' 추가.
alter table public.point_ledger drop constraint if exists point_ledger_reason_check;
alter table public.point_ledger add constraint point_ledger_reason_check
  check (reason in ('daily_login','custom_game_participation','cosmetic_purchase','admin_adjustment','hall_of_fame'));

-- 2) 롤오버 RPC 재정의: 기존 로직 + 상위 3위 포인트 지급.
drop function if exists public.rollover_tft_season(bigint, text, text, integer, timestamptz);

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
  v_awarded integer := 0;
  v_award record;
  v_bal integer;
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

  -- ── 상위 3위 포인트 지급 (큐별). 동점 위치는 제외(tie_count = 1 만) ──
  for v_award in
    with q as (
      select 'solo'::text as queue, m.id as member_id, m.tft_tier as tier, m.tft_rank as rk, m.tft_league_points as lp
        from public.members m where m.status = 'approved' and m.tft_tier is not null
      union all
      select 'doubleup'::text, m.id, m.tft_doubleup_tier, m.tft_doubleup_rank, m.tft_doubleup_league_points
        from public.members m where m.status = 'approved' and m.tft_doubleup_tier is not null
    ),
    scored as (
      select q.queue, q.member_id, q.tier, q.rk, q.lp,
        row_number() over (
          partition by q.queue
          order by
            (case upper(q.tier)
               when 'CHALLENGER' then 1 when 'GRANDMASTER' then 2 when 'MASTER' then 3
               when 'DIAMOND' then 4 when 'EMERALD' then 5 when 'PLATINUM' then 6
               when 'GOLD' then 7 when 'SILVER' then 8 when 'BRONZE' then 9 when 'IRON' then 10
               else 99 end) asc,
            (case upper(coalesce(q.rk, ''))
               when 'I' then 1 when 'II' then 2 when 'III' then 3 when 'IV' then 4 else 1 end) asc,
            coalesce(q.lp, 0) desc
        ) as pos,
        count(*) over (partition by q.queue, q.tier, q.rk, q.lp) as tie_count
      from q
    )
    select member_id, queue, pos,
      (case pos when 1 then 100 when 2 then 50 when 3 then 20 end) as amount
    from scored
    where pos <= 3 and tie_count = 1
  loop
    insert into public.point_accounts(member_id) values (v_award.member_id) on conflict do nothing;
    select a.balance into v_bal from public.point_accounts a where a.member_id = v_award.member_id for update;
    begin
      insert into public.point_ledger(member_id, amount, reason, reference_key, description, balance_after)
      values (
        v_award.member_id, v_award.amount, 'hall_of_fame',
        'hof:' || v_current.id::text || ':' || v_award.queue || ':' || v_award.pos::text,
        '명예의 전당 ' || v_award.pos::text || '위 보상(' || (case v_award.queue when 'solo' then '솔로' else '더블업' end) || ')',
        v_bal + v_award.amount
      );
      update public.point_accounts set balance = v_bal + v_award.amount, updated_at = v_now where member_id = v_award.member_id;
      v_awarded := v_awarded + 1;
    exception when unique_violation then
      null; -- 이미 지급됨(재실행 방어)
    end;
  end loop;

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
    'doubleup_count', v_doubleup_count,
    'awarded_count', v_awarded
  );
end;
$$;

revoke all on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) from public;
revoke all on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) from anon;
revoke all on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) from authenticated;
grant execute on function public.rollover_tft_season(bigint, text, text, integer, timestamptz) to service_role;
