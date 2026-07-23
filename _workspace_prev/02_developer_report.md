# 구현 결과

## 변경 파일 목록
| 파일 경로 | 변경 내용 |
|-----------|---------|
| `types/supabase.ts` | `MemberRankHistory` 타입에 `season_id: number \| null` 추가 (recorded_at 위) |
| `lib/sync/doSyncMember.ts` | history insert 직전 활성 시즌 1회 조회(maybeSingle) 후 insert 객체에 `season_id: activeSeason?.id ?? null` 추가 |
| `app/api/members/[id]/history/route.ts` | 활성 시즌 조회(maybeSingle) → 없으면 `{ history: [] }` 조기 반환 / 있으면 `.eq('season_id', activeSeason.id)` 필터 + 정렬 버그 수정(`ascending: false` + `limit(30)` 후 `.reverse()`), select 절에 `season_id` 추가 |

## 주요 변경 사항

### 1. types/supabase.ts
`MemberRankHistory` 타입에 `season_id: number | null` 필드 추가. Insert 정의는 `Optional<Omit<...>>` 형태라 자동 포함됨 (별도 수정 불필요, tsc 통과 확인).

### 2. lib/sync/doSyncMember.ts
- `if (solo || doubleUp)` 블록 내, insert 직전에 활성 시즌을 1회 조회:
  ```ts
  const { data: activeSeason } = await supabaseAdmin
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .maybeSingle()   // single() 미사용 — 0행일 때 에러 방지
  ```
- insert 객체에 `season_id: activeSeason?.id ?? null` 추가. 활성 시즌이 없어도 null로 기록되어 동기화는 실패하지 않음.

### 3. app/api/members/[id]/history/route.ts
- (a) 활성 시즌 조회(maybeSingle). 활성 시즌이 없으면 `{ history: [] }` 조기 반환.
- (b) 활성 시즌이 있으면 `.eq('season_id', activeSeason.id)` 필터로 해당 시즌 기록만 조회.
- (c) **정렬 버그 수정:** 기존 `ascending: true + limit(30)`은 *가장 오래된* 30개를 반환하는 버그였음. `ascending: false + limit(30)`으로 *최근* 30개를 가져온 뒤 `.reverse()`로 시간 오름차순 반환.
- select 절에 `season_id` 컬럼 추가.

## 응답 형태 (소비처 영향 없음)
응답 형태 `{ history: [...] }` 및 배열 정렬(시간 오름차순) 유지. `LpSparkline.tsx`, `MemberDetailPanel.tsx`는 변경 불필요.

## 자체 검증
- `npx tsc --noEmit` — 에러 없음(통과).

## 미구현 항목
없음. (DB 마이그레이션은 코드 실행 대상이 아니며 아래 SQL을 사용자가 직접 실행해야 함.)

---

## 사용자 실행 필요: DB 마이그레이션 SQL (Supabase SQL Editor)

> **중요:** 아래 SQL은 코드로 실행하지 않았다. Supabase SQL Editor에서 **직접 실행**해야 history 기록/조회가 정상 동작한다. 컬럼이 없으면 insert/select 시 에러 발생.

```sql
ALTER TABLE public.member_rank_history
  ADD COLUMN season_id bigint NULL REFERENCES public.seasons(id);

CREATE INDEX IF NOT EXISTS idx_member_rank_history_member_season
  ON public.member_rank_history (member_id, season_id, recorded_at);
```

- nullable + 기존 행은 `season_id = NULL`로 유지 → 호환 보존(과거 데이터 삭제 없음).
- `seasons.id`는 TS상 `number`이며, 실제 DB 타입에 맞춰 안전하게 `bigint` FK 사용.
- 기존 NULL 행은 활성 시즌 필터(`.eq('season_id', ...)`)에 걸려 그래프에서 제외됨(의도된 동작).
