# 구현 결과 — Phase 0 + Phase 1

범위: P0(토대) + P1(랭크 그래프·전적 통계). **P2/P3/P4/P5는 손대지 않았다.**

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|---|---|
| `lib/tft/tierScore.ts` | **신설.** `TIER_BASE`/`RANK_OFFSET`/`tierScore()` 이동 + `isApexTier()` 추가 |
| `app/components/ranking/LpSparkline.tsx` | 위 상수·함수 제거 → `@/lib/tft/tierScore` import. `tierLabel`이 `isApexTier` 사용 |
| `app/tft/MemberRanking.tsx` | `tierScore` import 경로를 `@/lib/tft/tierScore`로 변경 (**빌드 파손 회귀 지점**) |
| `lib/ui/styles.ts` | `SHELL` → `min-h-[calc(100vh-3.5rem)] bg-canvas px-4 pt-8 pb-24 md:py-12` |
| `app/globals.css` | `@theme`에 `--color-up`(=ok) / `--color-down`(=danger) / `--color-nav-h: 3.5rem` 3개만 추가 |
| `scripts/sql/20260730_tft_match_participants_member_idx.sql` | **신설(파일만, 미실행).** `tft_match_participants(member_id)` 인덱스 |
| `lib/members/approved.ts` | **신설.** `isApprovedMember()` — `server-only`, service role |
| `app/api/members/[id]/stats/route.ts` | **신설.** 서버 집계 전용 통계 API |
| `app/api/members/[id]/matches/route.ts` | approved 가드(404) + `limit` 쿼리 파라미터(기본 5, **최대 20 클램프**) |
| `app/api/members/[id]/history/route.ts` | approved 가드(404) + `limit(30)` → `60` |
| `app/components/charts/RankLineChart.tsx` | **신설.** 순수 SVG 꺾은선(높이 가변·티어 경계선·x축 3틱·hover 툴팁) |
| `app/components/charts/PlacementHistogram.tsx` | **신설.** 순수 SVG/div 8칸 등수 분포 |
| `app/components/ranking/MemberDetailPanel.tsx` | 탭 셸(개요/전적) + 탭별 lazy fetch + `sm:max-w-lg` + useEffect 의존성 버그 수정 |

**추가한 npm 패키지 없음.** recharts 등 차트 라이브러리 미도입 (판정 1 준수).

## 주요 변경 사항

### 보안 (최우선 검증 대상)
- `matches` / `history` / `stats` 3개 라우트 모두 진입부에서 `isApprovedMember(memberId)` 확인,
  실패 시 **404 + `{ error: '찾을 수 없습니다.' }`** (403은 존재를 알리므로 사용 안 함).
- `isApprovedMember()`는 Supabase 에러(잘못된 UUID → `22P02` 등)도 `false`로 취급 → 500 누출 없음.
- `matches`의 `limit`은 `parseLimit()`으로 `1..20` 클램프. `NaN`/음수/소수 전부 방어.

### `/api/members/[id]/stats`
- 응답: `{ total, avgPlacement, top4Rate, winRate, distribution: number[8], recentForm: number[≤10], topUnits: [{character_id,name,imageUrl,count,avgPlacement}] }`
- **`units` 원본은 절대 반환하지 않는다.** 서버에서 매치당 중복 제거(`Set`) 후 상위 8개만 집계.
- 쿼리는 `tft_matches`를 루트로 `tft_match_participants!inner(placement, units)` 조인.
  ⚠ 처음엔 참가자 테이블을 루트로 잡았으나, **PostgREST는 to-one 임베디드 컬럼(`game_datetime`) 기준 정렬을 지원하지 않아**
  최근 100건이 아니라 임의 100건이 뽑힌다. 기존 `matches/route.ts`와 동일한 방향(매치가 루트)으로 교정했다.
- 표본 100건, `recentForm` 10건.

### 차트
- `RankLineChart` — `LpSparkline`의 톤(polyline+polygon 그라데이션+hover 툴팁) 유지.
  `viewBox="0 0 320 {height}"` + `w-full h-auto`로 반응형(왜곡 없음, `preserveAspectRatio` 기본값).
  티어 경계(`TIER_BASE`) 중 현재 범위에 드는 것만 점선 + 좌측 1글자 라벨. x축은 처음/중간/끝 3틱.
  히스토리 2건 미만이면 기존과 동일한 빈 상태 문구.
- `PlacementHistogram` — 1위 amber / 2~4위 emerald / 5~8위 slate. total 0이면 "매치 데이터 없음".

### `MemberDetailPanel`
- 탭 2개: **개요**(랭크 그래프 + 요약 4지표 + 최근 폼) / **전적**(등수 분포 + 자주 쓴 기물 + 매치 목록).
  계정 탭은 P2 범위라 만들지 않았다.
- **lazy fetch:** 마운트 시 `history` + `stats` 2건만(기존과 동일 개수). `matches`는 전적 탭 최초 진입 시 1건.
  `stats`는 두 탭이 공유하므로 중복 호출 없음. `requestedRef`가 리소스별 중복 요청을 막고 실패 시 재시도 가능하게 되돌린다.
- **버그 수정:** `useEffect` 의존성 `[member.id]` → `[tab, member.id, queue, dataKey, load]`.
  솔로↔더블업 전환 시 매치·통계가 실제로 갱신된다.
- `dataKey = member.id|queue` 변경 시 상태 초기화는 **렌더 중 setState 패턴**으로 처리했다.
  effect 안에서 초기화하면 `react-hooks/set-state-in-effect` 린트 에러(현 설정에서 error)가 난다.
- 폭: `max-w-sm sm:max-w-lg`.

### `SHELL` 회귀 범위 (실측)
`SHELL`을 실제로 쓰는 페이지는 **`/`, `/steam`, `/lol`, `/profile`, `/custom-games` 5개**뿐이다.
`/tft`(`app/tft/page.tsx` → `<main className="mx-auto">`)와
`/hall-of-fame`(`HallOfFameClientPage.tsx`가 자체 `min-h-[calc(100vh-3.5rem)]`)은 **SHELL을 쓰지 않는다.**
→ 이 두 페이지는 P5에서 하단 탭바를 넣을 때 별도로 하단 여백을 줘야 한다. **P5 인수인계 항목.**

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 (에러 0) |
| `npm run lint` | 에러 0. 경고 5건은 전부 `app/profile/ProfileEditor.tsx` **기존** 경고 |
| `npm run build` | 통과. `/api/members/[id]/stats`가 ƒ(dynamic)로 등록됨 |
| `stats` (approved) | 200 — `total:100, avgPlacement:4.19, top4Rate:56, winRate:15, distribution 합계 100 = total` ✔ |
| `stats` (존재하지 않는 UUID) | **404** ✔ |
| `stats` (`not-a-uuid`) | **404** (500 아님) ✔ |
| `matches?limit=999` | 반환 건수 **20** ✔ |
| `history` | 200, 정상 payload |
| `/`, `/tft`, `/steam`, `/profile`, `/custom-games`, `/hall-of-fame` | 전부 **307** (비로그인 정상) |
| DB 쓰기 | **0건.** 조회만 수행 |

## 미구현 / 인계 사항

1. **미승인 멤버로 404 검증 불가** — 현재 DB의 members 18행이 **전부 `approved`**다.
   존재하지 않는 UUID·형식 오류 UUID로만 404를 확인했다. pending 시드가 생기면 QA에서 재확인 필요.
2. **로그인 필요 페이지의 시각 회귀 미확인** — 6개 페이지 전부 307이고 자격증명 입력은 수행하지 않는다.
   `SHELL` 변경은 className 문자열 변경뿐이며 빌드는 통과했으나, **375×812 육안 확인은 QA에서 로그인 상태로 필요.**
3. `LpSparkline` 컴포넌트 자체는 남겨두었다(`HistoryPoint` 타입 소유). 현재 default export 사용처는 없으나
   제거는 범위 밖이라 손대지 않았다.
4. `scripts/sql/20260730_tft_match_participants_member_idx.sql`은 **파일만 생성. 실행하지 않았다.**
5. `--color-nav-h`는 계획대로 `--color-` 네임스페이스에 넣었다. Tailwind v4가 이를 색상 토큰으로 간주해
   `bg-nav-h` 같은 무의미한 유틸리티를 만들어낸다(빌드·런타임 영향 없음). P5에서 네비 높이를 실제로 쓸 때
   `--nav-h`로 옮길지 판단 필요.
