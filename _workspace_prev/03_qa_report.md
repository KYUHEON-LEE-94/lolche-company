# QA 검증 보고서

## 정적 검증
| 항목 | 결과 |
|------|------|
| `npx tsc --noEmit` | ✅ 0 에러 |
| `npm run lint` | ✅ 0 에러 (기존 경고 10건만, 변경 파일에서 신규 경고 없음) |
| `npm run build` | ✅ 성공 (전체 라우트 정상 생성, /api/members/[id]/history 포함) |

## 코드 리뷰
- `history/route.ts`: 활성 시즌 maybeSingle 조회 → 없으면 `{history:[]}` 조기 반환 → 있으면 season_id 필터 + `ascending:false`+`limit(30)`+`reverse()`로 최근 30개 오름차순 반환. ✅ 계획 일치.
- `doSyncMember.ts`: insert 직전 활성 시즌 maybeSingle 조회, `season_id: activeSeason?.id ?? null`. 활성 시즌 없어도 동기화 실패 없음. ✅
- `types/supabase.ts`: MemberRankHistory에 `season_id: number | null` 추가. Insert는 Optional이라 자동 호환. ✅

## 런타임 테스트 — 보류 사유
history API는 신규 `season_id` 컬럼을 쿼리하므로, **사용자가 아래 마이그레이션을 Supabase에서 실행하기 전에는 실DB 런타임 해피패스 테스트 불가**(컬럼 부재 시 PostgREST 에러 → 500).
정적 검증으로 코드 정합성은 확인됨. 마이그레이션 적용 후 런타임 테스트 재개 가능.

## 사용자 실행 필요 (Supabase SQL Editor)
```sql
ALTER TABLE public.member_rank_history
  ADD COLUMN season_id bigint NULL REFERENCES public.seasons(id);

CREATE INDEX IF NOT EXISTS idx_member_rank_history_member_season
  ON public.member_rank_history (member_id, season_id, recorded_at);
```

## 커밋 보류
현재 `main` 브랜치이고 마이그레이션 선행이 필요하므로, 자동 커밋/푸시는 사용자 확인 후 진행.
