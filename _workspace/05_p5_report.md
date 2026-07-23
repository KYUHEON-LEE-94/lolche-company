# 구현 결과 — Phase 5 (D1 레이아웃 개편)

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|-----------|---------|
| `app/components/SiteNav.tsx` | 상단 링크 행 `hidden md:flex` + 모바일 로고, 모바일 하단 탭바(4항목) 추가. `NAV_ITEMS` 단일 배열에 `inTabBar` 플래그로 상·하단 동시 렌더. 인라인 SVG 아이콘 6종 |
| `app/page.tsx` | 대시보드 요약 화면으로 재작성. `Promise.all` 병렬화, 6개 섹션 |
| `lib/ui/styles.ts` | `SHELL` 하단 여백 `pb-24` → `pb-28`, `TABBAR_SAFE_PB` 상수 신설 |
| `app/components/AuthButtons.tsx` | 모바일 라벨 축약(프로필 관리→프로필 / 관리 페이지→관리) + `max-sm:px-2.5 max-sm:text-xs` |
| `app/tft/page.tsx` | (예외 최소침습) `<main>`에 `TABBAR_SAFE_PB` 1클래스만 추가 |
| `app/hall-of-fame/_components/HallOfFameClientPage.tsx` | (예외 최소침습) 루트 div에 `TABBAR_SAFE_PB` 1클래스만 추가 |

**손대지 않은 것:** `app/tft/MemberRanking.tsx`, `/steam`, `/custom-games`, `/profile`, `/admin/*`, `proxy.ts`, DB.

---

## 주요 변경 사항

### 1. SiteNav — 상단 유지 + 하단 탭바 추가
- 375px 가로 스크롤의 직접 원인이던 `overflow-x-auto` 링크 행을 `hidden md:flex`로 전환. 모바일 상단에는 로고 텍스트 + AuthButtons만 남는다.
- 하단 탭바: `md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)—인용`, 항목 `min-h-[56px]`, `grid-cols-4`.
- 탭 항목 4개 고정: **홈 / 롤체 / 내전 / 스팀**. `명예의 전당`·`롤`은 `inTabBar:false`로 상단 + 대시보드 카드에서만 진입.
- `HIDDEN_PREFIXES = ['/admin','/login','/auth']`는 컴포넌트 최상단 early-return이라 **상·하단 모두** 동시에 미노출.
- `LOL_ENABLED` 분기 보존: false면 `NAV_ITEMS`에 `/lol` 자체가 들어가지 않아 상단·하단·대시보드 카드 어디에도 없다. (데스크톱 실측 링크 목록: 홈/롤체 랭킹/내전/스팀/명예의 전당 — 롤 없음)
- 아이콘은 전부 인라인 SVG + `stroke="currentColor"`로 active 색 상속.

### 2. app/page.tsx — 요약 대시보드
쿼리 **총 4회, 라운드트립 2회**:
- 1파(`Promise.all`): `members`(approved, 필요한 10컬럼만) / 활성 시즌 / 모집 중 내전
- 2파: 최근 매치 5건 (approved id 배열 의존이므로 순차)

파생으로 처리해 추가 쿼리 0인 것:
- **랭크 변동** — 같은 행의 `tft_*_prev`와 `tierScore()` 차이. 절대값 상위 3
- **최근 동기화 시각** — members의 `last_synced_at` 최댓값
- **리더보드 TOP5** — `compareRank()` 정렬 후 slice

섹션: ① 롤체 TOP5 ② 최근 랭크 변동 ③ 모집 중 내전 ④ 최근 매치 ⑤ 프로필 체크리스트 ⑥ 축약 네비 카드(4장).

**ISR 개인화 유출 방지 (계획 위험 1):** 서버에서 세션을 일절 읽지 않는다. `ProfileChecklist`는 Phase 3에서 만든 `'use client'` 아일랜드를 그대로 삽입했고, `/api/me/profile-status`(force-dynamic)가 데이터를 준다. 비로그인 실측에서 401 → 체크리스트 미렌더로 확인.

**노출 필터:** `members`는 `.eq('status','approved')`, 최근 매치는 그 id 배열로 `.in('tft_match_participants.member_id', ids)`.

**마이그레이션 degrade:** 모집 중 내전 조회는 `isMissingColumnError()`(42703)를 잡아 신규 컬럼 없는 select로 폴백해 카운트만 유지한다.

### 3. 모바일 우선 정리
- 지표 `grid-cols-1 sm:grid-cols-3`, 본문 `grid-cols-1 lg:grid-cols-3`, 네비 카드 `1 → sm:2 → lg:4`
- 지표 라벨 `text-[10px]` → `text-xs`. 신규 `text-[10px]` 0건
- 리더보드 행 `min-h-[44px]`, 내전 카드 링크 `min-h-[44px]`, 탭바 항목 실측 **94×56px**
- `app/globals.css` 토큰 무변경 (새 체계 없음)

### 4. 하단 여백
- `SHELL`(= `/steam`, `/custom-games`, `/profile`, `/`) → `pb-28`(112px) / `md:py-12`
- `SHELL` 미사용 페이지 2곳(`/tft`, `/hall-of-fame`)에 `TABBAR_SAFE_PB = 'pb-28 md:pb-0'` 1클래스만 추가

### ⚠ 구현 중 발견·수정한 실제 버그
`SiteNav`의 JSX 주석에 `pb-[env(…)]`라고 적었더니 **Tailwind v4 스캐너가 이를 후보 클래스로 인식**해
값이 말줄임표인 잘못된 유틸리티를 생성 → `Parsing CSS source code failed`로 **globals.css 전체가 깨졌다.**
주석 문구를 자연어로 바꿔 해결. 교훈: 주석에도 Tailwind 유틸리티 형태의 문자열을 쓰면 안 된다.

---

## 검증 결과

### 정적 검사
| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 |
| `npm run lint` | ✅ 0 errors (기존 `ProfileEditor.tsx` warning 5건만, 이번 변경과 무관) |
| `npm run build` | ✅ Compiled successfully / 24 페이지 생성 |
| `any` 사용 | 0건 |
| `<img>` | 0건 (프로필 이미지는 `next/image`) |
| service role의 클라이언트 import | 없음 (`app/page.tsx`는 서버 컴포넌트) |
| `git status` | 임시 파일 잔여 0건 |

### 브라우저 실측 (dev, 375×812 / 1280×800)

> **제약 (그대로 보고):** `proxy.ts`가 `/login`·`/auth/*`를 제외한 **모든 경로를 로그인 필수**로 막고, 로그인은 Discord OAuth뿐이라 에이전트가 로그인할 수 없다. 인증 우회는 시도하지 않았다(도구 차단됨). 대신 **공개 경로인 `/login`의 페이지 컴포넌트를 검증 대상 페이지로 임시 re-export**해 실제 렌더 결과를 실측했고, 검증 후 원본을 복원했다(`git status`로 확인). `proxy.ts`는 **끝까지 무변경**이다.

| 페이지 | `documentElement.scrollWidth` vs `innerWidth` | 하단 여백 | 결과 |
|---|---|---|---|
| `/` (대시보드) | 375 = 375, overflow 요소 0 | main `padding-bottom: 112px`, 마지막 카드가 탭바 위 | ✅ |
| `/tft` | 375 = 375, overflow 요소 0 | main `112px`, 마지막 멤버 카드 완전 노출 | ✅ |
| `/hall-of-fame` | 375 = 375 | 루트 `112px` | ✅ |
| `/steam` | 375 = 375, overflow 요소 0 | main `112px` | ✅ |
| `/login` | 375 = 375 | — | ✅ `nav` 0개(상·하단 모두 미노출) |

기타 실측:
- 탭바 링크 4개 각각 **94×56px** (터치 타깃 ≥44px 충족), 탭바 높이 57px, `bottom: 812` (뷰포트 하단 고정)
- **desktop 1280:** 하단 탭바 `display: none`, 상단 링크 5개 정상 노출
- 콘솔 에러: `profile-status 조회 실패: HTTP 401` 2건뿐 — 비로그인 상태의 정상 동작(체크리스트 미렌더). CSS/하이드레이션 에러 0건
- 스크린샷: 대시보드 모바일 상단·하단, 대시보드 데스크톱, `/tft` 하단, `/hall-of-fame`, `/steam` 하단 (대화 로그에 첨부)

### 미검증 항목 (로그인 필요 — QA에서 확인 요망)
- `/profile`, `/custom-games`, `/custom-games/[id]` — `SHELL`을 쓰므로 `pb-28`이 코드상 상속되나 실렌더 미확인
- **`/custom-games/[id]` 하단 액션 vs 탭바 충돌** (계획 위험 8) — 미확인
- `/admin/*` 하단바 미노출 — `HIDDEN_PREFIXES` 코드 경로가 `/login`과 완전히 동일(early return)하고 `/login`에서 nav 0개를 실측했으나, 실페이지 확인은 미완
- 로그인 상태 상단 바 폭(로고 + 프로필/관리/로그아웃 3버튼) — 축약을 넣었으나 실측 미완. **모바일에서 관리자 계정으로 상단 넘침 여부 확인 필요**
- 실기기 iOS `env(safe-area-inset-bottom)` 동작

## 미구현 / 후속 과제
- **`app/tft/MemberRanking.tsx`의 `bg-fixed`** — iOS Safari 스크롤 저크 알려진 이슈. 계획대로 **기록만** 하고 손대지 않았다 (611줄, 이번 범위 밖).
- `/tft`·`/hall-of-fame`의 하단 여백은 자체 셸 **바깥**에 생겨 배경 이미지가 끝나는 지점에 미세한 색 경계가 보인다. 색상은 동일 `--color-canvas`라 실사용상 무해하나, 근본 해결은 각 페이지 셸을 `SHELL`로 통일하는 별도 과제.
