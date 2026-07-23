# 구현 결과 — Phase 2 + Phase 3

범위: P2(계정 탭) + P3(프로필 완성도 체크리스트). **P4/P5는 손대지 않았다.**
P3의 4번(대시보드 삽입)은 지시대로 제외했다 — P5에서 `app/page.tsx` 재작성 시 붙인다.

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|---|---|
| `app/api/members/[id]/accounts/route.ts` | **신설.** approved 가드(404) + 노출 필드 화이트리스트 |
| `app/components/ranking/MemberDetailPanel.tsx` | `계정` 탭 추가(계정 2개 이상일 때만), 계정 카드, 대표 기준 안내 문구, 헤더 랭크 교체 |
| `app/api/me/profile-status/route.ts` | **신설.** `force-dynamic`, 세션 기준 개인화 상태 |
| `app/components/ProfileChecklist.tsx` | **신설.** `'use client'` 클라이언트 아일랜드 |
| `app/profile/page.tsx` | 상단(PageHeader 아래)에 `<ProfileChecklist />` 삽입 |

**DB 쓰기 0건.** 마이그레이션 파일 추가 없음. npm 패키지 추가 없음.

## Phase 2 — 계정 탭

### `GET /api/members/[id]/accounts`
- 진입부에서 P1의 `isApprovedMember(memberId)` 재사용 → 실패 시 **404 `{ error: '찾을 수 없습니다.' }`**.
- `listRiotAccounts()` + `pickPrimaryAccount()` 재사용. 정렬은 **대표 우선 → `account_no` 오름차순**
  (= `is_primary desc, account_no asc`와 동일한 파생 규칙).
- **노출 화이트리스트** (`toPublicAccount`): `id, account_no, is_primary(파생값), riot_game_name,
  riot_tagline, synced, tft_* 5종, tft_doubleup_* 5종, last_synced_at`.
  → `riot_puuid` / `lol_puuid` / `member_id` / `created_at` **미포함**.
  `synced: !!a.riot_puuid` 로 boolean 만 내보내 PUUID 자체는 유출되지 않는다.
- `riot_accounts` 테이블 부재(마이그레이션 미적용)는 500이 아니라
  `{ accounts: [], migration_required: true }` 로 degrade — 계정 탭이 숨겨질 뿐 패널이 깨지지 않는다.

### `MemberDetailPanel`
- 탭 정의는 3개(`개요`/`전적`/`계정`)지만 렌더는 `visibleTabs`로 필터한다.
  **`accounts.length > 1` 일 때만 계정 탭이 보인다.**
- 계정 목록은 탭과 무관하게 마운트 시 1회 fetch한다 — 탭 노출 여부 자체가 개수에 의존하기 때문.
  응답이 최대 3행이라 지연 로드 이득이 없다. (`requestedRef` 중복 방지 로직 그대로 사용)
- 계정 카드: **대표 배지** / `게임명#태그` / 현재 queue 기준 `티어 랭크 · LP · 승-패` / `마지막 동기화` 시각.
  랭크가 null이면 `synced` 여부에 따라 "언랭크" 또는 "동기화 대기".
- **부계정 선택 시 교체되는 것은 패널 헤더의 랭크 한 줄뿐이다.** 그래프·매치 fetch URL은 바뀌지 않는다.
- 부계정이 선택된 상태에서 `개요`/`전적` 탭에 진입하면 상단에 amber 배너로
  **"매치와 그래프는 대표 계정 기준입니다."** 를 띄운다. 계정 탭 하단에도 같은 문구를 상시 표시한다.
- `matches` / `history` 라우트에 `accountId` 파라미터를 **추가하지 않았다** (지시·판정 3 준수).
- 다른 멤버로 전환해 계정이 1개가 되면 사라진 탭에 남지 않도록 `overview`로 되돌린다
  (기존 파일이 쓰던 렌더 중 setState 패턴 유지 — effect 내 setState는 현 lint 설정에서 error).

## Phase 3 — 프로필 완성도 체크리스트

### `GET /api/me/profile-status`
- `export const dynamic = 'force-dynamic'`.
- **대상은 오직 `getMyMember()`(세션 → user_id → discord_id fallback)로만 결정.**
  쿼리스트링·body를 읽는 코드가 존재하지 않는다(`GET()` 이 `req` 인자를 아예 받지 않는다).
- 반환: `{ ok, hasMember, status, riotAccountCount, hasSteam, hasProfileImage, steamVisibilityOk }`.
  `steamVisibilityOk = !!steam_id64 && steam_visibility === 3`.
- 비로그인 **401**. 멤버 미등록이면 200 + 전부 false/0.
- `members`는 `steam_id64, steam_visibility, profile_image_path` 3컬럼만 select.

### `ProfileChecklist.tsx`
- `'use client'` + `useEffect` fetch. **서버에서 세션을 읽지 않으므로 ISR 공유 캐시에 개인화가 실릴 여지가 없다.**
  그대로 `app/page.tsx`(revalidate=60)에 꽂아도 안전한 형태로 만들어 두었다(삽입은 P5).
- 항목 4개: 멤버 등록 신청 / 관리자 승인 / **스팀 계정 연결** / 프로필 이미지.
  각 항목에 CTA 링크(`/profile`, `/steam`).
- 스팀 항목 안내 문구: **"같이 할 게임을 찾아줘요."** (스팀 연결 1/18의 원인이 안내 부족이라는 가설 검증 포인트)
- **전항 완료 시 `null` 반환 — 아무것도 렌더하지 않는다.** 로딩 중에도 `null`(레이아웃 점프 없음).
- fetch 실패(401 포함) 시 `console.error` 후 미렌더 — 비로그인 화면에서 깨지지 않는다.
- 스팀은 연결됐는데 프로필이 비공개면(`steamVisibilityOk=false`) 하단에 amber 안내 한 줄 추가.
- `riotAccountCount`는 API 스펙 요구대로 반환하지만 현재 UI 항목으로는 쓰지 않는다
  (멤버 등록 항목이 사실상 동일 조건을 커버).

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 (에러 0) |
| `npm run lint` | 에러 0. 경고 5건은 전부 `app/profile/ProfileEditor.tsx` **기존** 경고 |
| `npm run build` | 통과. `/api/members/[id]/accounts`·`/api/me/profile-status` 둘 다 ƒ(dynamic) 등록 |
| `/api/members/{approved}/accounts` | 200, 정상 payload |
| **PUUID 유출** | **members 18행 전부에 대해 응답 본문 `puuid` 문자열 0건** ✔ |
| `/api/members/not-a-uuid/accounts` | **404** (500 아님) ✔ |
| `/api/members/{존재하지 않는 UUID}/accounts` | **404** ✔ |
| `/api/me/profile-status` 비로그인 | **401** ✔ |
| `/api/me/profile-status?memberId={타인 id}` | **401** — 쿼리 파라미터를 읽지 않음 ✔ |
| `/`, `/tft`, `/steam`, `/profile`, `/custom-games`, `/hall-of-fame` | 전부 **307** (비로그인 정상, 회귀 없음) |
| DB 쓰기 | **0건.** 조회만 수행 |

## 미검증 / 인계 사항

1. **다중 계정 경로는 실데이터 검증 불가.** 현재 DB의 members 18행이 **전부 `riot_accounts` 1행**이다
   (`members_with_multi_accounts=0`). 따라서 실제로 확인한 것은
   **"계정이 1개일 때 계정 탭이 렌더되지 않는다"** 뿐이다.
   대표 배지 위치 / 부계정 선택 시 헤더 랭크 교체 / 안내 배너 노출은 **코드 경로로만 보장**되며,
   부계정 시드가 생긴 뒤 QA 재확인이 필요하다. (지시대로 DB 쓰기는 하지 않았다.)
2. **미승인 멤버로 404 검증 불가.** 18행이 전부 `approved`라 P1과 동일하게
   존재하지 않는 UUID·형식 오류 UUID로만 404를 확인했다.
3. **로그인 상태 육안 확인 미수행.** 6개 페이지가 전부 307이고 자격증명 입력은 수행하지 않는다.
   `/profile` 상단 체크리스트의 실제 렌더·CTA 이동·"전항 완료 시 미렌더"는 QA에서 로그인 상태 확인 필요.
4. 패널 헤더 랭크는 대표 선택 시 기존대로 `member.tft_*`(솔로 캐시)를 쓴다.
   `queue=doubleup` 일 때 헤더가 솔로 값을 보여주는 것은 **기존 동작**이며 이번 범위에서 바꾸지 않았다.
   부계정을 고르면 이 자리에는 선택 queue에 맞는 값이 들어간다(더블업 선택 시 값이 없으면 줄 자체가 사라짐).
5. `.next` 디렉토리가 손상돼 첫 빌드가 `ENOTEMPTY`로 실패했다. `rm -rf .next` 후 정상 빌드.
   코드 문제가 아니다.
