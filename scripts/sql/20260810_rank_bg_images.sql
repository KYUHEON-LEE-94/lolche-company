-- 랭킹 카드 배경: 이미지 배경 지원. SQL Editor 에서 직접 실행. 코드는 미적용 시 CSS-only 로 degrade.

-- 1) 이미지 배경 경로 컬럼
alter table public.ranking_card_effects add column if not exists image_path text null;

-- 2) effect_key 를 nullable 로 (이미지 배경은 CSS 키가 없다)
alter table public.ranking_card_effects alter column effect_key drop not null;

-- 3) effect_key CHECK 완화: null 허용
alter table public.ranking_card_effects drop constraint if exists ranking_card_effects_effect_key_check;
alter table public.ranking_card_effects add constraint ranking_card_effects_effect_key_check
  check (effect_key is null or effect_key in ('aurora_glow','hex_grid','starfield','sunset_blaze','verdant_pulse'));

-- 4) 정확히 하나만: CSS 키 XOR 이미지 경로
alter table public.ranking_card_effects add constraint ranking_card_effects_kind_chk
  check ((effect_key is not null) <> (image_path is not null));

-- 5) 멤버 장착 이미지 미러 컬럼
alter table public.members add column if not exists ranking_card_bg_image text null;

-- 6) 신규 public 스토리지 버킷 (프레임과 분리)
insert into storage.buckets (id, name, public) values ('rank-backgrounds','rank-backgrounds', true)
on conflict (id) do nothing;
-- 업로드/삭제는 service_role 라우트가 수행하므로 별도 storage RLS 정책 불필요(공개 read 만).
