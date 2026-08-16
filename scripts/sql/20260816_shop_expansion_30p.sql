-- 상점 확장: 신규 프레임 3종 + 랭킹 카드 배경 3종을 모두 30P로 등록한다.
-- SQL Editor에서 실행한 뒤 애플리케이션을 배포한다. 기존 상품의 가격은 변경하지 않는다.

-- CSS 배경 키 제약을 새 3종까지 확장한다. 이미지형 배경(effect_key null)도 계속 허용한다.
alter table public.ranking_card_effects drop constraint if exists ranking_card_effects_effect_key_check;
alter table public.ranking_card_effects add constraint ranking_card_effects_effect_key_check
  check (effect_key is null or effect_key in (
    'aurora_glow', 'hex_grid', 'starfield', 'sunset_blaze', 'verdant_pulse',
    'cosmic_tide', 'rose_mist', 'frost_crown'
  ));

insert into public.profile_frames(key, label, image_path, is_active, sort_order, price_points, is_purchasable)
values
  ('moonlit_crescent', '월광 초승', '/frames/generated/moonlit-crescent.png', true, 430, 30, true),
  ('sapphire_prism', '사파이어 프리즘', '/frames/generated/sapphire-prism.png', true, 440, 30, true),
  ('crimson_bloom', '크림슨 블룸', '/frames/generated/crimson-bloom.png', true, 450, 30, true)
on conflict (key) do nothing;

insert into public.ranking_card_effects(key, label, description, effect_key, price_points, sort_order)
values
  ('cosmic_tide', '코스믹 타이드', '청록과 남색이 천천히 흐르는 심해의 빛', 'cosmic_tide', 30, 600),
  ('rose_mist', '로즈 미스트', '장밋빛 안개가 은은하게 번지는 배경', 'rose_mist', 30, 610),
  ('frost_crown', '프로스트 크라운', '차가운 서리 결정과 빙하빛 광채', 'frost_crown', 30, 620)
on conflict (key) do nothing;
