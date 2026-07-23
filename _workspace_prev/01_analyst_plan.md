# Analyst 구현 계획

## 작업 요약
`member_rank_history`에 `season_id`(nullable)를 추가해 동기화 시 활성 시즌 id를 함께 기록하고, history 조회 API는 활성 시즌 기록만 최근 30개를 시간 오름차순으로 반환하도록 수정한다(정렬 버그 동시 수정). 과거 시즌 데이터는 보존한다.

## 영향 파일 목록

| 파일 경로 | 변경 유형 | 이유 |
|-----------|---------|------|
| (Supabase DB) `member_rank_history` | 마이그레이션(ALTER TABLE) | `season_id` nullable 컬럼 추가 — 코드만으로는 불가, 사용자가 직접 실행 |
| `types/supabase.ts` (L93 Season, L115-125 MemberRankHistory) | 수정 | `MemberRankHistory` 타입에 `season_id: number \| null` 추가 |
| `lib/sync/doSyncMember.ts` (L76-90) | 수정 | insert 전 활성 시즌 조회 후 `season_id` 함께 기록 |
| `app/api/members/[id]/history/route.ts` | 수정 | 활성 시즌 필터 + 정렬 버그(최근 30개) 수정 |
| `app/components/ranking/LpSparkline.tsx` | 영향 확인(변경 불필요) | 소비처 — props 구조 동일 |
| `app/components/ranking/MemberDetailPanel.tsx` (L182-192) | 영향 확인(변경 불필요) | 소비처 — `d.history` 응답 형태 동일 |

## DB 마이그레이션 (사용자가 Supabase SQL Editor에서 직접 실행)
`seasons.id`는 TypeScript `number`. 실제 DB 타입(int8/bigint 추정)에 맞춰 FK. 안전하게 `bigint` 사용:
```sql
ALTER TABLE public.member_rank_history
  ADD COLUMN season_id bigint NULL REFERENCES public.seasons(id);

CREATE INDEX IF NOT EXISTS idx_member_rank_history_member_season
  ON public.member_rank_history (member_id, season_id, recorded_at);
```
- nullable + 기존 행은 `season_id = NULL`로 유지되어 호환 보존.

## 구현 상세

### 1. 타입 — `types/supabase.ts` MemberRankHistory
`season_id: number | null` 필드 추가. Insert 정의는 `Optional<Omit<...>>`라 자동 포함.

### 2. 동기화 — `lib/sync/doSyncMember.ts`
history insert 직전 활성 시즌 1회 조회:
```ts
const { data: activeSeason } = await supabaseAdmin
  .from('seasons')
  .select('id')
  .eq('is_active', true)
  .maybeSingle()   // single() 금지 — 0행일 때 에러
```
insert에 `season_id: activeSeason?.id ?? null` 추가. 활성 시즌 없으면 null, 동기화 실패 없음.

### 3. 조회 API — `app/api/members/[id]/history/route.ts`
(a) 활성 시즌 조회(maybeSingle). 활성 시즌 없으면 `{ history: [] }` 조기 반환.
(b) 활성 시즌 있으면 `.eq('season_id', activeSeason.id)` 필터.
(c) 정렬 버그 수정: `.order('recorded_at', { ascending: false }).limit(30)` 으로 최근 30개 가져온 뒤 `.reverse()`로 오름차순 반환.

### 4. 소비처 (변경 불필요)
LpSparkline / MemberDetailPanel — 응답 형태(`{ history: [...] }`) 유지되어 영향 없음.

## 가정 (설계 결정)
- **활성 시즌 없을 때 조회**: `{ history: [] }` 반환 ("활성 시즌의 기록만" 요건에 정합).
- **기존 데이터(season_id=NULL)**: 활성 시즌 필터에 걸려 그래프에서 제외(과거 시즌 분리, 의도된 동작). 데이터는 삭제 안 됨.
- **단일 멤버 함수 내 시즌 1회 조회**: 요청 범위가 이 함수 내부이므로 함수 내 조회로 구현.

## 검증 포인트 (QA)
1. 동기화 시 새 history row의 `season_id`가 활성 시즌 id로 채워짐.
2. 활성 시즌 없는 상태 동기화 → 에러 없이 `season_id=NULL` 기록.
3. history API가 활성 시즌 기록만 반환(과거/NULL 제외).
4. 반환 배열이 `recorded_at` 오름차순, 31개 이상 누적 시 최근 30개만 반환(이전엔 가장 오래된 30개 — 버그 수정 확인).
5. 활성 시즌 없을 때 `{ history: [] }` 반환.
6. tsc/lint 통과, LpSparkline/MemberDetailPanel 정상.
