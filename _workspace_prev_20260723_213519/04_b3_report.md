# Phase B3 구현 결과 — 내전 UI 개편

범위: B3만. A(riot_accounts)·B2 API는 미변경. **DB 쓰기 없음. 마이그레이션 여전히 미실행.**

---

## 1. 변경 파일 목록

| 파일 | 유형 | 내용 |
|---|---|---|
| `lib/customGames/display.ts` | 신규 | 표시 전용 헬퍼. 게임 종류/상태 라벨·배지, KST 포맷터, `<input>` 값 변환 |
| `app/custom-games/page.tsx` | 전면 재작성 | 모집 폼 교체, 멤버 체크박스 UI + `loadMembers()` 제거, 카드 목록 |
| `app/custom-games/[id]/page.tsx` | 대폭 수정 | 확정/대기 명단 분리, 강퇴·참가/취소·수정 UI, 비-TFT 섹션 차단 |
| `app/page.tsx` | 소폭 | 내전 카드에 "모집 중 n건" 배지 |
| `CLAUDE.md` | 수정 | 내전 섹션 신규(권한·대기열 설계 근거·API 목록·`game_kind` vs `game_type`·타임존·degrade) + DB 테이블 4행 + 노출 필터 문구 수정 |

---

## 2. API 계약 정합 (실제 라우트 코드 기준으로 맞춤)

**생성 `POST /api/custom-games`** — `participant_ids`/`guests` 완전 제거. 실제 전송 body:
```json
{ "title", "scheduled_date": "YYYY-MM-DD", "scheduled_time": "HH:mm",
  "capacity", "game_kind", "game_kind_label", "game_type"?, "max_rounds"? }
```
`game_type`·`max_rounds`는 `game_kind==='tft'`일 때만 포함한다(서버도 비-TFT면 solo로 고정하지만
불필요한 필드를 보내지 않는다). 응답은 `{ id }` → 상세로 라우팅.

**참가 `POST|DELETE /[id]/join`** — body 없음. POST 응답의 `confirmed`/`position`으로 토스트 문구를 분기.
**강퇴 `DELETE /[id]/participants/[participantId]`** — `confirmed[]`/`waitlist[]` 항목의 `id`(참가행 id,
`member_id` 아님)를 사용. **수정 `PATCH /[id]`** — 생성과 같은 문자열 일자/시간 형식.

**GET 소비:** 목록은 `confirmed_count`/`waitlist_count`/`guest_count`/`host_member_name`/`can_manage`/
`my_participation`, 상세는 `confirmed[]`/`waitlist[]`(각 항목에 `position`·`confirmed`·`is_host`)/
`can_manage`/`my_participation`을 그대로 사용한다. 상세는 `participants[]`(호환 필드)를 쓰지 않는다.

---

## 3. 구현 내용

### `app/custom-games/page.tsx`
- **모집 폼**: 제목 / 일자(`<input type="date">`) / 시간(`<input type="time">`) / 게임 종류(4버튼) / 정원.
  - `기타` 선택 시에만 라벨 입력칸 노출(≤30자)
  - `롤체` 선택 시에만 게임 방식(개인전/2인 팀전)과 최대 판수 노출.
    팀전이면 정원 입력이 8로 고정·disabled + "4팀 × 2인 구조라 정원이 8명으로 고정됩니다" 안내
  - 비-TFT 선택 시 "모집·참가 관리만 지원합니다(라운드 결과 기록 없음)" 안내
  - ⚠ **일자·시간은 문자열 그대로 전송.** 클라이언트에 `new Date(...)` 변환 코드가 존재하지 않는다
  - 기본 일자는 `todayKstDate()`(KST 기준 오늘), 기본 시간 `21:00`
- **제거**: 멤버 체크박스 선택 UI, `selectedIds`, 생성 시 게스트 일괄 입력 폼,
  그리고 **`loadMembers()`의 anon 클라이언트 직접 조회**(계획 B-R13). `supabaseClient` import도 사라졌다
- **카드 목록**(테이블 → 카드 그리드): `3/8` 인원(확정+게스트 / 정원), `대기 n명` 배지,
  KST 일정, 게임 종류 배지, TFT면 개인전/팀전 배지, 상태 배지, 주최자 이름, 내 상태 배지
- **버튼 전환**: `my_participation`이 없고 정원 미달 → `참가 신청`, 정원 초과 → `대기 신청`,
  이미 신청 상태 → `참가 취소`. 삭제 버튼은 `can_manage`일 때만
- 헤더에 "모집 중 n건" 문구

### `app/custom-games/[id]/page.tsx`
- **확정 명단 / 대기 명단 분리.** 대기자는 순번(`position - confirmed.length`)과 함께 표시하고
  "확정 인원이 취소하면 순번대로 자동 확정됩니다" 안내를 붙였다
- **강퇴 버튼** — `can_manage && !종료 && !is_host`일 때만 노출. 주최자 행에는 나오지 않는다
  (서버도 400으로 막는다)
- **참가/취소 버튼** — `status==='recruiting'`일 때만. `my_participation` 유무로 전환
- **`game_kind !== 'tft'`면 라운드·팀·게스트 섹션을 렌더하지 않는다.**
  팀 배정 패널·점수 테이블·라운드별 팀 구성·게스트 추가/삭제·라운드 추가 버튼 전부 `isTft` 게이트 안에 있다.
  대신 "○○ 내전은 모집·참가 관리만 지원합니다" 안내를 표시
- **수정 모달(PATCH)** — `can_manage`일 때만. 제목/일자/시간/정원/(TFT면)최대 판수.
  정원 하향 시 **"정원을 줄이면 확정자 n명이 대기자로 이동합니다"** 경고(계획 B-R12).
  `n`은 `confirmedList.length - effectiveMemberCapacity(newCapacity, guests.length)`로 서버와 동일 규칙 계산.
  팀전이면 정원 입력 disabled
- 관리 버튼(수정/라운드 추가/내전 종료)은 `can_manage` 게이트. 팀 배정 패널도 동일
- 점수 테이블·팀 배정 대상은 **확정 인원 + 게스트**만 사용(대기자 제외 — 서버 teams 가드와 일치)
- 404/503 응답은 `loadError`로 받아 본문에 안내 문구로 표시(빈 화면 아님)

### `app/page.tsx`
`supabaseService`로 `custom_games` `status='recruiting'` count를 조회해 내전 카드에 배지 표시.
**쿼리 에러는 0건으로 취급**하므로 마이그레이션·RLS 상태와 무관하게 대시보드가 죽지 않는다.

### `lib/customGames/display.ts`
`Intl.DateTimeFormat` 인스턴스를 모듈 상수로 만들어 **타임존을 `Asia/Seoul`로 고정**한다.
`toKstDateInput`/`toKstTimeInput`은 `en-CA`/`en-GB`+`hourCycle:'h23'`로 `YYYY-MM-DD`/`HH:mm`를 뽑는다
(수정 폼 프리필용). `constants.ts`만 import하고 **server-only인 `game.ts`는 import하지 않는다.**

---

## 4. 판단이 필요했던 지점

### 4-1. "UI 숨김은 권한 통제가 아니다"를 코드에 반영한 방식
모든 관리 액션은 서버가 403을 반환한다. UI는 `can_manage`를 **표시 여부에만** 쓰고,
**요청을 보낼지 말지 판단하는 데 쓰지 않는다** — 버튼이 눌리면 무조건 API를 호출하고
응답 에러 메시지를 그대로 배너에 띄운다. 클라이언트에 권한 판정 로직(주최자 비교 등)은 없다.
`can_manage`가 어떤 이유로 틀려도 서버 판정이 최종이고, UI는 그 결과를 보여줄 뿐이다.

### 4-2. 주최자의 "참가 취소" 버튼
목록 GET의 `my_participation`에는 `is_host`가 없어 클라이언트에서 주최자 여부를 알 수 없다.
버튼을 숨기려고 host 판정을 클라이언트에서 재구현하지 않았다(B-R3와 같은 종류의 실수가 된다).
주최자가 누르면 서버가 400 + "주최자는 참가를 취소할 수 없습니다. 내전을 삭제하세요."를 반환하고
그 문구가 그대로 표시된다. 상세 페이지에는 `is_host`가 있어 강퇴 버튼은 정확히 숨겨진다.

### 4-3. 목록 카드의 `n/정원`
`confirmed_count + guest_count`를 분자로 쓴다. 게스트도 같은 정원을 소비하므로(B2 §2-2)
확정 멤버 수만 보여주면 "5/8인데 참가 신청이 대기로 떨어지는" 모순이 생긴다.

### 4-4. 상태 전환 UI
B2에서 `recruiting → in_progress` 전환 API가 없으므로 해당 버튼을 만들지 않았다.
`recruiting` 상태에서도 라운드/팀/게스트가 동작하므로(OPERABLE_STATUSES) 기능 공백은 없다.
`cancelled`는 상태 배지 표시만 지원한다.

---

## 5. 런타임 확인 (localhost:3000, 마이그레이션 미적용)

| 요청 | 결과 |
|---|---|
| `GET /api/custom-games` | **200** `{"games":[],"migration_required":true}` |
| `GET /` | **307** → `/login?next=%2F` (미들웨어 인증 게이트) |
| `GET /custom-games` | **307** → `/login?next=%2Fcustom-games` |
| `GET /custom-games/{uuid}` | **307** → `/login` |

**500은 한 건도 없다.** 로그인 세션이 있는 경로에서는:
- 목록 페이지 — `migration_required:true`를 받아 상단에 노란 안내 배너 + 빈 목록("모집 중인 내전이 없습니다"). 화면이 죽지 않는다
- 상세 페이지 — 503 응답의 `error` 문구를 본문에 표시 + "← 목록으로" 링크
- 대시보드 — `custom_games` count 쿼리가 실패해도 0으로 취급, 배지만 사라진다

전체 참가/대기/강퇴/수정 플로우는 `scripts/sql/20260725_custom_game_recruit.sql` 실행 후에만 검증 가능하다.
**SQL 먼저 → 배포 나중.**

---

## 6. 검증 결과

- `npx tsc --noEmit` — **통과** (에러 0)
- `npm run lint` — **통과** (에러 0. 경고 9건은 전부 기존 파일의 선행 경고, 이번 변경과 무관.
  변경한 4개 파일에서 발생한 경고는 0건)
- `npm run build` — **통과**. `/custom-games`, `/custom-games/[id]` 정상 빌드
- `any` 0건. catch는 전부 `catch { ... }`(에러 객체 미사용) 패턴
- `supabaseClient`(브라우저) 및 service role 클라이언트가 내전 클라이언트 컴포넌트에 남아 있지 않음
- 클라이언트 코드에 `new Date(` 를 통한 일정 변환 없음 (표시는 `Intl` 헬퍼, 전송은 원문 문자열)

---

## 7. QA 주의사항 / 미구현

1. **마이그레이션 미실행.** 계획 §8 B3 체크리스트 중 "3/8 인원·대기 배지·버튼 전환·비-TFT 섹션 미노출"은
   SQL 실행 + 로그인 세션 후에만 실제 확인 가능하다.
2. **브라우저 타임존 변경 테스트 권장.** `TZ=America/New_York`로 브라우저를 띄워도
   목록/상세의 일정 표기가 동일해야 한다(전부 `Asia/Seoul` 고정 포매터).
   생성 시에도 입력한 그대로의 KST 시각으로 저장되어야 한다.
3. **`in_progress`/`cancelled` 전환 UI 없음** (B2에 해당 API가 없어서). 의도된 미구현.
4. 게스트 추가 UI를 `can_manage` 게이트 안으로 옮겼다. 기존에는 로그인만 하면 보였다.
5. 목록 카드의 삭제 버튼은 `can_manage`일 때만 보이지만, 서버가 최종 판정이므로
   API 직접 호출 시 비권한자는 403이어야 한다(B1/B2 회귀 확인 항목).
