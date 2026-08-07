-- 상점 가격 표준화 + 신규 프레임/랭킹배경. SQL Editor 에서 직접 실행.
-- 코드는 이 SQL 미적용 시에도 degrade(신규 아이템 미노출·구가격 유지)하므로 배포 순서 무관.

-- 1) 기본가 표준화: 모든 프레임 50P, 랭킹 카드 배경 100P. (사용자 지정 기본가)
--    ★ 1회성 초기화다. 이후 관리자가 상점 관리 페이지에서 개별 가격을 조정하므로,
--      이 마이그레이션을 재실행하면 개별 조정이 초기화된다 — 최초 1회만 실행할 것.
update public.profile_frames set price_points = 50;
update public.ranking_card_effects set price_points = 100;

-- 2) 신규 프레임 3종 (public/frames/generated 의 생성 PNG). 50P.
insert into public.profile_frames(key,label,image_path,is_active,sort_order,price_points,is_purchasable)
values
  ('neon_halo','네온 헤일로','/frames/generated/neon-halo.png',true,400,50,true),
  ('golden_wreath','황금 화환','/frames/generated/golden-wreath.png',true,410,50,true),
  ('verdant_ring','비취 고리','/frames/generated/verdant-ring.png',true,420,50,true)
on conflict(key) do nothing;

-- 3) 랭킹 카드 배경 effect_key CHECK 를 신규 키까지 확장 (rankEffects.ts / globals.css 와 일치).
alter table public.ranking_card_effects drop constraint if exists ranking_card_effects_effect_key_check;
alter table public.ranking_card_effects add constraint ranking_card_effects_effect_key_check
  check (effect_key in ('aurora_glow','hex_grid','starfield','sunset_blaze','verdant_pulse'));

-- 4) 신규 랭킹 카드 배경 2종. 100P. (상점은 설명 대신 실제 이펙트 미리보기를 보여주므로 description 은 참고용)
insert into public.ranking_card_effects(key,label,description,effect_key,price_points,sort_order)
values
  ('sunset_blaze','선셋 블레이즈','따뜻한 노을 그라데이션','sunset_blaze',100,400),
  ('verdant_pulse','비취 펄스','에메랄드 맥동 글로우','verdant_pulse',100,500)
on conflict(key) do nothing;
