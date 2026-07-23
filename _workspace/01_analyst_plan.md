# 분석 결과 — C1 통계 / C2 계정탭 / C3 체크리스트 / C4 스팀 presence / D1 레이아웃

## 0. 현재 코드 실측

| 항목 | 실제 값 |
|---|---|
| 차트 라이브러리 | **없음.** deps는 supabase/framer-motion/next/react뿐 |
| 기존 차트 | **순수 SVG로 이미 존재** — `app/components/ranking/LpSparkline.tsx` (polyline+polygon+hover 툴팁, 166줄) |
| `tft_match_participants` 조인 키 | `member_id`(nullable) **와** `puuid` 둘 다 보유 |
| 매치 수집 범위 | **대표 계정 puuid만** (`doSyncMember.ts:295,322,337`) |
| `member_rank_history` | `member_id`만. **`riot_account_id` 없음** |
| `/api/members/[id]/matches` | `queue`만, 계정별 필터 없음, `limit(5)` 고정 |
| `/api/members/[id]/history` | 파라미터 없음, 활성 시즌 + `limit(30)` |
| 위 두 API 인증 | **없음.** `supabaseAdmin` 직행, `approved` 필터 없음 ⚠ |
| `members.tft_*_prev` | `tft_tier_prev/tft_rank_prev/tft_lp_prev` **이미 존재** |
| Steam 요약 파서 | `personastate`/`gameextrainfo` **미파싱** |
| 상단 네비 | 6항목 `overflow-x-auto` — 모바일 **가로 스크롤 발생 중** |
| 디자인 토큰 | `--color-canvas/surface/surface-2/line/line-strong/brand/ok/warn/danger` 9개 |
| `SHELL` | `min-h-[calc(100vh-3.5rem)] bg-canvas px-4 py-12` — 하단바 여유 없음 |

---

## 1. 판정

### 판정 1. 차트 라이브러리 → **추가하지 않는다. 순수 SVG 확장.**
1. 선례 존재 — `LpSparkline`이 이미 SVG로 구현돼 톤이 일치. recharts를 넣으면 스타일이 갈라진다
2. 번들 — recharts는 d3 계열 포함 gzip ~90–110KB. 필요한 건 꺾은선 1종 + 8칸 막대 1종뿐이라 SVG 30줄이면 끝
3. RSC 마찰 — `ResponsiveContainer`가 클라 전용, 초기 0-height 깜빡임. SVG는 `viewBox`+`w-full`로 서버 렌더 그대로 반응형

→ `app/components/charts/` 신설. `tierScore()`를 `lib/tft/tierScore.ts`로 승격(순환 import 방지). **`MemberRanking.tsx`가 `LpSparkline`에서 import 중이라 함께 고쳐야 빌드가 깨지지 않는다.**

### 판정 2. C1 배치 → **`MemberDetailPanel` 내부 탭. 별도 페이지 없음.**
진입 동선이 이미 `/tft` 카드 → 패널이고 패널이 `history`+`matches`를 이미 fetch한다.
패널 폭 `max-w-sm`(384px)은 좁으므로 **모바일 그대로, `sm:` 이상 `max-w-lg`**.
탭 3개: `개요`(랭크 그래프+요약) / `전적`(등수 분포+매치) / `계정`(C2).

### 판정 3. C2 계정별 필터 → **"계정별 랭크"까지만.**
| 데이터 | 계정별 분리 | 이유 |
|---|---|---|
| 랭크(티어/LP/승패) | **가능** | `riot_accounts.tft_*`/`lol_*`에 실값 존재 |
| 매치 전적 | **불가** | 참가행이 `member_id` + **대표 puuid**로만 들어옴. 부계정 puuid 필터는 항상 0건 |
| 랭크 히스토리 | **불가** | `member_rank_history`에 계정 축 없음 |

→ 계정 탭은 `riot_accounts` 스냅샷 카드만. 부계정 선택 시 **"매치·그래프는 대표 계정 기준"** 안내 명시.
→ `matches`/`history`에 `accountId` 파라미터를 **추가하지 않는다**(항상 빈 결과를 주는 API는 부채).

### 판정 4. C4 실시간성 → **`/steam` 페이지 불변. 별도 force-dynamic 라우트 + 폴링 + 인메모리 60초 TTL.**
`/steam`은 `revalidate=300` **경로 단위 공유 캐시**. 여기에 Steam 호출이나 개인화를 넣으면 A의 HTML이 B에게 서빙된다. 이미 확립된 탈출구가 있다 — `SharedWithMe.tsx`(Client) → `/api/steam/shared-with-me`(force-dynamic). **그 패턴을 복제한다.**
- 모듈 스코프 `{data, expiresAt}` 캐시, TTL 60초 (`lib/steam/storeSearch.ts`의 `STEAM_CATALOG_CACHE_TTL_MS` 방식과 동일)
- 레이트리밋: 18명 → `GetPlayerSummaries` 100개/호출 → **1회/60초 = 1,440회/일**. 한도 10만 대비 1.4%. 뷰어 수와 무관한 상수
- 클라이언트는 `visibilityState === 'visible'`일 때만 폴링
- **인증 필수** — 없으면 남의 온라인 상태를 캐는 공개 프록시가 된다. 로그인 + `approved`
- **DB 저장 금지** — 휘발성. 컬럼을 만들면 크론이 하루 지난 "온라인"을 박제한다 → 마이그레이션 불필요
- ⚠ `personastate`는 프로필 비공개면 항상 0. `steam_visibility !== 3`은 "오프라인"이 아니라 **"표시 불가"**로 분리

### 판정 5. D1 네비 → **상단 유지 + 모바일 하단 탭바 추가(대체 아님).**
- 현재 6항목 `overflow-x-auto`가 375px 가로 스크롤의 직접 원인
- 하단 탭바는 **4항목까지**(홈/롤체/내전/스팀). 5개 이상이면 터치 타깃이 44px 밑으로
- 상단은 모바일에서 로고 + AuthButtons만 (`hidden md:flex`)
- `SiteNav`가 이미 `'use client'`+`usePathname`이라 `NAV_ITEMS` 하나로 상·하단 동시 렌더 가능. `HIDDEN_PREFIXES` 재사용

### 판정 6. 대시보드 쿼리 → **`revalidate=60` 유지, 4쿼리 전부 `Promise.all` 병렬**
현재 4쿼리를 **직렬 await** 중(`page.tsx:104-107`) — 이것부터 병렬화.
| 섹션 | 쿼리 |
|---|---|
| 지표 + 리더보드 TOP5 + **랭크 변동** | **1** (approved 전체 18행. `tft_*`와 `tft_*_prev`가 같은 행이라 변동 계산에 추가 쿼리 0) |
| 활성 시즌 | 1 |
| 최근 동기화 | **0** (위 쿼리의 `last_synced_at` 최댓값 파생) |
| 모집 중 내전 | 1 (`head:true` count → `limit(3)` 실 데이터로 교체, 카운트는 길이로) |
| 최근 매치 5건 | 1 |
| 체크리스트(C3) | **0 (서버)** — 개인화라 클라 아일랜드 |

`revalidate`를 30 이하로 내리지 않는다 — Riot 동기화가 하루 1회 크론이라 60초보다 빨리 안 바뀐다.

### 판정 7. `.eq('status','approved')` 노출 필터
| 신규 표면 | 방식 |
|---|---|
| 대시보드 리더보드/변동 | `.eq('status','approved')` 직접 |
| 대시보드 최근 매치 | approved id 배열을 `.in('member_id', ids)` (조인 내 status보다 안전·검증 쉬움) |
| `/api/members/[id]/stats` | approved 아니면 **404** (403은 존재를 알린다) |
| `/api/steam-presence` | 멤버 목록 approved + `steam_id64 not null`. 요청자도 approved |
| `/api/me/profile-status` | 자기 자신만. 세션 유도 |

⚠ **기존 결함(범위 밖이나 Phase 1에 묶어 처리):** `/api/members/[id]/matches`·`/history`는 인증도 approved 필터도 없다. member UUID는 `/tft` 페이로드로 공개되므로 pending/rejected 멤버 전적이 조회된다.

### 판정 8. DB 마이그레이션 → **5개 항목 전부 불필요.**
C1은 기존 658/4,330행, C2는 `riot_accounts` 기존 컬럼, C3는 전부 파생, C4는 저장 금지, D1은 `tft_*_prev` 기존.

이번에 넣을 만한 유일한 DDL(권장, 무해):
```sql
create index if not exists tft_match_participants_member_idx
  on public.tft_match_participants (member_id);
```

계정별 그래프가 필요해질 때만 쓸 초안(**이번에 적용하지 않음**):
```sql
alter table public.member_rank_history
  add column if not exists riot_account_id uuid
    references public.riot_accounts(id) on delete cascade;
update public.member_rank_history h set riot_account_id = a.id
  from (select distinct on (member_id) member_id, id from public.riot_accounts
         order by member_id, is_primary desc, account_no asc) a
 where a.member_id = h.member_id and h.riot_account_id is null;
create index if not exists member_rank_history_account_recorded_idx
  on public.member_rank_history (riot_account_id, recorded_at desc);
```

---

## 2. Phase 분할

```
P0 ─┬─> P1 ──> P2
    └────────> P5
P3 (독립)   P4 (독립)
```

### **Phase 0 — 토대** (사용자 영향 0)
1. `lib/tft/tierScore.ts` 신설 — `LpSparkline`의 `tierScore`/`TIER_BASE`/`RANK_OFFSET` 이동. `LpSparkline`·`MemberRanking` import 수정
2. `lib/ui/styles.ts` — `SHELL`에 하단 여백: `px-4 pt-8 pb-24 md:py-12` (**전 페이지 영향 ⚠ 회귀 1순위**)
3. `app/globals.css` — 토큰 **확장만** 3개(`--color-up`=ok, `--color-down`=danger, `--color-nav-h`). 새 체계 금지
4. `tft_match_participants(member_id)` 인덱스 SQL(선택)

### **Phase 1 — C1 랭크 그래프 + 전적 통계** (최우선)
1. `app/components/charts/RankLineChart.tsx` — `LpSparkline` 일반화(높이 가변, y축 티어 경계, x축 날짜 3개)
2. `app/components/charts/PlacementHistogram.tsx` — 1~8위 8칸. 1위 amber / 2~4위 emerald / 5~8위 slate
3. `app/api/members/[id]/stats/route.ts` 신설
   - approved 확인 → 아니면 404
   - `tft_match_participants` → `tft_matches!inner(queue_id, game_datetime)`, queue 필터, 최근 100건
   - `select('placement, units')`만
   - **서버에서 집계 후 집계값만 반환**: `{ total, avgPlacement, top4Rate, winRate, distribution:number[8], recentForm:number[10], topUnits:[{character_id,name,imageUrl,count,avgPlacement}] }`
   - 원본 4,330행을 클라이언트로 절대 내보내지 않는다
4. `history/route.ts` — `limit(30)`→60, approved 가드
5. `matches/route.ts` — `limit(5)`→쿼리 파라미터(기본 5, **최대 20 클램프**), approved 가드
6. `MemberDetailPanel.tsx` — 탭 셸(`개요`/`전적`), **탭별 lazy fetch**(마운트 시 동시 fetch를 3개로 늘리지 말 것), `sm:max-w-lg`
7. `MemberDetailPanel`의 `useEffect` 의존성 버그 수정: `[member.id]`인데 본문이 `queue`를 씀 → 솔로↔더블업 전환 시 매치 미갱신. `[member.id, queue]`로

### **Phase 2 — C2 계정 탭** (P1의 탭 셸 의존)
1. `app/api/members/[id]/accounts/route.ts` — approved 가드 + **노출 필드 화이트리스트**(`riot_puuid`/`lol_puuid` 절대 금지, `/api/me/riot-accounts`의 `toPublicAccount()` 패턴 복제)
2. 계정 카드 목록, `is_primary desc, account_no asc` 정렬, 대표 배지
3. 부계정 선택 시 랭크만 교체 + 안내 문구
4. **계정 1개면 탭 자체를 숨긴다** (현재 부계정 0건 — 빈 탭 노출 금지)

### **Phase 3 — C3 프로필 완성도** (독립)
1. `app/api/me/profile-status/route.ts` (`force-dynamic`) — `{ hasMember, status, riotAccountCount, hasSteam, hasProfileImage, steamVisibilityOk }`
2. `app/components/ProfileChecklist.tsx` (`'use client'`) — 항목별 CTA 링크
3. `/profile` 상단 삽입
4. 대시보드에도 삽입 — ⚠ **반드시 클라이언트 아일랜드.** `revalidate=60` 공유 캐시라 서버에서 세션을 읽으면 A의 체크리스트가 B에게 서빙된다
5. 스팀 항목에 "왜 필요한지" 한 줄 + `/steam` 직링크 (1/18 대응의 핵심 가설)

### **Phase 4 — C4 스팀 게임 중** (독립)
1. `lib/steam/api.ts` — `personastate: number`, `gameextrainfo: string|null`, `gameid: string|null` 추가. 기존 소비자(`syncSteamMember.ts`)는 무시하므로 무해하나 타입 컴파일 확인
2. `lib/steam/presence.ts` (`import 'server-only'`) — 모듈 스코프 TTL 캐시, `STEAM_PRESENCE_TTL_MS` 기본 60000
3. `app/api/steam-presence/route.ts` (`force-dynamic`) — 로그인 + approved 가드
   ⚠ `app/api/steam/`는 CLAUDE.md가 "**DB만 조회, `lib/steam/*` import 금지**"로 못박은 경계다. **경로를 분리**해 규칙을 "디렉토리 = 경계"로 유지한다(`steam-catalog`가 분리된 것과 같은 이유)
4. `app/steam/SteamPresence.tsx` (`'use client'`) — `visibilitychange` 연동 60초 폴링
5. `/steam`에 아일랜드 삽입. **`revalidate=300`과 DB-only 원칙은 한 글자도 안 건드린다**
6. `STEAM_PRESENCE_TTL_MS` 문서화. `server-only` 체인 유지

### **Phase 5 — D1 레이아웃** (P0 의존, 범위 한정)
**손대는 파일 3개뿐: `app/page.tsx`, `app/components/SiteNav.tsx`, `lib/ui/styles.ts`.**
`/tft`, `/steam`, `/custom-games`, `/hall-of-fame`, `/admin/*`은 **갈아엎지 않는다** — 하단바 여백만 상속.

1. `SiteNav.tsx`
   - 상단: 모바일에서 링크 행 `hidden md:flex`
   - 하단: `fixed bottom-0 md:hidden`, `bg-canvas/95 backdrop-blur border-t border-line`, `pb-[env(safe-area-inset-bottom)—인용`, 아이템 `min-h-[56px]`
   - 인라인 SVG 아이콘 4개(`currentColor` 상속)
2. `app/page.tsx` 요약 화면
   - `Promise.all` 병렬화
   - ① 리더보드 TOP5 ② 최근 랭크 변동(`tft_lp_prev` 파생, 절대값 상위 3) ③ 모집 중 내전 ④ 최근 매치 5건 ⑤ 체크리스트(P3 아일랜드) ⑥ 축약 네비 카드
   - 모바일 우선: 1열 → `sm:2` → `lg:3`. `text-[10px]` 남용을 `text-xs` 이상으로. 터치 타깃 44px
   - **`LOL_ENABLED` 분기 보존**
3. `MemberRanking.tsx`는 **건드리지 않는다**(611줄). `bg-fixed`의 iOS 스크롤 저크는 **후속 과제로 기록**

---

## 3. 위험 요소

**높음**
1. **ISR × 개인화 유출 (P3, P5)** — `app/page.tsx`는 `revalidate=60` 공유 캐시. 체크리스트를 서버에서 세션 읽어 렌더하면 다른 사용자에게 서빙된다 → **개인화는 100% 클라 아일랜드 + force-dynamic API**
2. **`app/api/steam/` 경계 위반 (P4)** — 규칙을 신뢰할 수 없게 된다 → 경로를 `steam-presence`로 분리
3. **`SHELL` 전역 회귀 (P0)** — `/tft`, `/steam`, `/profile`, `/custom-games`, `/hall-of-fame` 전부 사용. `/hall-of-fame`은 자체 `min-h`를 써서 하단바에 가려질 수 있다
4. **`tierScore` 이동 (P0)** — `MemberRanking.tsx`가 `LpSparkline`에서 import 중. 누락하면 `/tft` 빌드 실패

**중간**
5. `MemberDetailPanel` useEffect 의존성 — 현재도 버그. 탭 도입 시 표면화
6. `stats` 페이로드 — `units`는 매치당 8~10개, 100매치 = ~1,000객체. 서버 집계 후 상위 8개만
7. **부계정 0건** — C2 검증 데이터 없음. 계정 1개일 때 탭 숨김으로 정상 경로 확보
8. 하단 탭바 vs `custom-games/[id]` 하단 액션 충돌 확인 필요
9. Steam presence 정확도 — `steam_visibility !== 3`을 "오프라인"으로 단정하면 오정보
10. 신규 4개 라우트의 approved 필터 누락

**낮음**
11. `LOL_ENABLED` 분기가 대시보드 재작성 중 유실 → 죽은 링크
12. iOS `env(safe-area-inset-bottom)` 누락 시 홈 인디케이터에 가림
13. `matches`의 `limit` 미검증 → 최대 20 클램프

---

## 4. QA 검증 포인트

**보안/노출 (최우선)**
- [ ] `/api/members/{pending id}/stats` → 404. `/matches`, `/history` 동일
- [ ] `/api/members/{id}/accounts` 응답에 `riot_puuid`·`lol_puuid`·`member_id` 미포함
- [ ] `/api/steam-presence` 비로그인 401, pending 403
- [ ] `/api/me/profile-status`가 항상 세션 기준, body/쿼리 id 무시
- [ ] `.next/static`에 `STEAM_API_KEY` 문자열 부재
- [ ] 대시보드에 미승인 멤버 부재

**ISR 캐시 유출**
- [ ] A 로그인 → `/` → 로그아웃 → B 로그인 → `/`에 A의 체크리스트 상태 미노출
- [ ] 시크릿 창 `/` → 체크리스트가 개인정보 없이 렌더되거나 미렌더
- [ ] `/steam`이 Steam API **0회** 호출

**기능**
- [ ] 히스토리 2건 미만 → 빈 상태 문구(에러 아님)
- [ ] 등수 분포 8칸 합계 = total. 매치 0건 → 빈 상태
- [ ] 솔로↔더블업 전환 시 매치·통계 실제 갱신(기존 버그)
- [ ] 계정 1개면 탭 미노출. 2개 이상이면 대표 배지가 첫 행
- [ ] 부계정 선택 시 "대표 계정 기준" 안내, 빈 그래프 아님
- [ ] 체크리스트 전항 완료 시 미렌더
- [ ] presence: 두 브라우저 동시 로드 → Steam 호출 1회만. 60초 후 1회 추가
- [ ] presence: 백그라운드 탭이면 폴링 정지
- [ ] `steam_visibility !== 3` → "표시 불가"

**레이아웃/모바일 (375×812)**
- [ ] 전 페이지 가로 스크롤 0 (`document.body.scrollWidth <= innerWidth`)
- [ ] 하단 탭바가 콘텐츠를 가리지 않는다 — 6개 페이지 전부
- [ ] `/custom-games/[id]` 하단 액션과 미충돌
- [ ] 터치 타깃 ≥ 44×44, iOS 홈 인디케이터 미가림
- [ ] `md:` 이상 하단바 미노출
- [ ] `/admin/*`, `/login`, `/auth/*` 하단바 미노출
- [ ] `NEXT_PUBLIC_LOL_ENABLED=false`에서 롤 항목 전부 미노출, `/lol` 404

**회귀/빌드**
- [ ] `tsc` / `lint` / `build` 통과, `any` 0건, catch 패턴 준수
- [ ] `<img>` 미사용, service role이 `'use client'`에서 import되지 않음
- [ ] 대시보드 쿼리 병렬 4회 이하

---

## 5. 가정
- 부계정 0건 → C2는 "동작하는 빈 상태" 보장에 초점. 실데이터 검증은 시드 필요
- `custom_games` 0건 → 대시보드 "모집 중 내전"은 빈 상태가 기본
- `personastate`: 0=오프라인, 1~6=온라인 계열. `gameextrainfo`가 있으면 게임명 배지 우선
