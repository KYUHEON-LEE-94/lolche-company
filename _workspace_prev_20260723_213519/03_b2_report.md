# Phase B2 구현 결과 — 스키마 + 모집/참가/대기열

범위: B2만. B3(UI)·A(riot_accounts)는 미변경. 기존 UI는 컴파일 에러가 없어 손대지 않았다.
**DB 쓰기 없음. 마이그레이션 미실행 상태.**

---

## 1. 변경 파일 목록

| 파일 | 유형 | 내용 |
|---|---|---|
| `scripts/sql/20260725_custom_game_recruit.sql` | 신규 | STEP 0~4 + 롤백 주석. **실행하지 않음** |
| `lib/customGames/constants.ts` | 신규 | 게임 종류/상태 유니온, 검증 상수, 입력 파서(`parseScheduledAt` 등) |
| `lib/customGames/waitlist.ts` | 신규 | `splitParticipants()` 순수 함수, `effectiveMemberCapacity()` |
| `lib/customGames/game.ts` | 신규 | `GameRow`/`GAME_COLUMNS`, `fetchGame()`, 42703/23505 판별, 비-TFT·종료 가드 |
| `lib/customGames/authorize.ts` | 재작성 | `requireGameManager()` 삭제 → `getViewerMember()` / `canManageGame()` / `authorizeGameManage()` |
| `types/supabase.ts` | 수정 | `CustomGame`에 5개 컬럼 추가, `CustomGameKind`·`CustomGameStatus` 유니온 |
| `app/api/custom-games/route.ts` | 재작성 | GET 파생 필드 + POST 재작성 |
| `app/api/custom-games/[id]/route.ts` | 재작성 | GET 확정/대기 분리, **PATCH 신규**, DELETE 권한 교체 |
| `app/api/custom-games/[id]/join/route.ts` | 신규 | POST(신청) / DELETE(취소) |
| `app/api/custom-games/[id]/participants/[participantId]/route.ts` | 신규 | 강퇴 |
| `app/api/custom-games/[id]/end/route.ts` | 수정 | 권한 교체 |
| `app/api/custom-games/[id]/rounds/route.ts` | 수정 | 권한 교체 + 비-TFT 400 + 확정 인원만 매치 탐색 |
| `app/api/custom-games/[id]/teams/route.ts` | 수정 | 권한 교체 + 비-TFT 400 + 확정 인원만 배정 |
| `app/api/custom-games/[id]/guests/route.ts` | 수정 | 권한 교체 + 비-TFT 400 + 하드코딩 8 → `capacity` |
| `app/api/custom-games/[id]/guests/[guestId]/route.ts` | 수정 | 권한 교체 + 비-TFT 400 + `custom_game_id` 스코프 |

---

## 2. 판단이 필요했던 지점

### 2-1. `host_member_id` — **nullable + `on delete set null` 유지** (NOT NULL 채택하지 않음)

지시대로 판단해 근거를 SQL 주석(STEP 1)에 남겼다.

데이터 0건이라 NOT NULL 자체는 가능하지만, NOT NULL은 `on delete set null`과 충돌해
`on delete cascade`를 강제한다. 그러면 **멤버 1명 추방 시 그가 주최한 내전 전체가
참가자·라운드·결과까지 함께 삭제**된다. 내전 기록은 주최자 개인 자료가 아니라 참가자
전원의 공용 기록이므로(`hall_of_fame`이 `member_id=null` + 이름 스냅샷으로 보존하는 것과
같은 이유) "주최자만 사라지고 내전은 남는" 쪽을 택했다. `on delete restrict`는 추방 자체를
막아 버려 더 나쁘다.

따라서 **B-R2 방어 코드는 반드시 필요하며, 그대로 구현했다**:

```ts
canManageGame(game, viewerMemberId, isAdmin) {
  if (isAdmin) return true
  if (game.host_member_id === null || viewerMemberId === null) return false
  return game.host_member_id === viewerMemberId
}
```
`null === null` 통과 경로는 코드에 존재하지 않는다. 정상 생성 경로에서 `host_member_id`가
null이 되는 일은 없다(서버가 세션에서만 채운다). 추방으로 사후에만 null이 된다.

### 2-2. 정원과 게스트의 관계
게스트도 같은 정원을 소비하도록 `effectiveMemberCapacity(capacity, guestCount)`로
확정 멤버 수를 계산한다. 게스트 추가 한도는 `guestCount + 1 > capacity`로만 판정한다 —
멤버 신청 수(대기자 포함)를 합산해 막으면 대기자가 생기는 순간 게스트를 영원히 못 넣는다.

### 2-3. `POST /api/custom-games`에서 게스트 일괄 등록 제거
생성 시 `guests[]`를 받아 Riot API를 호출하던 로직을 제거했다(생성 = 모집글 등록).
게스트는 생성 후 `POST /[id]/guests`로 추가한다. 계획 B2 명세에 게스트 언급이 없고,
비-TFT 내전 생성 경로에서 Riot 호출이 섞이는 것을 피하기 위함이다.

### 2-4. `recruiting → in_progress` 전환 API는 만들지 않았다
PATCH가 `status`를 건드리지 못하게 화이트리스트로 막았으므로, 상태 전환 수단은
`POST /[id]/end`(→`ended`)뿐이다. 대신 rounds/teams/guests가 `recruiting`·`in_progress`
양쪽에서 동작하도록 가드를 `ended|cancelled` 거부로 완화해 기능 공백은 없다.
`in_progress`/`cancelled` 전환 UI는 B3에서 필요해지면 추가하면 된다.

---

## 3. 구현 내용 상세

### 대기열 (계획 B-3 준수)
- `status('confirmed'|'waitlisted')` 컬럼 **만들지 않았다.** SQL STEP 2에 금지 사유를 주석으로 박아 뒀다.
- `splitParticipants(rows, capacity)`: `(joined_at, id)` 정렬 상위 capacity명이 확정.
  호출자가 정렬을 보장하지 않아도 되도록 함수 내부에서 재정렬한다.
- **취소는 DELETE 1건뿐이고 승격 코드는 존재하지 않는다.** 승격 경합 자체가 없다.
- 중복 신청: `custom_game_participants_uniq` 유니크 인덱스 + 앱은 **23505 → 409** 매핑.
  select→insert 사전 검사는 하지 않는다(더블클릭에 뚫리므로 방어선으로 삼지 않음).
- 총 신청 상한 `min(capacity*3, 60)`.

### 권한
- `getViewerMember()`: 세션 `user_id` → `members`, 미연결 시 `discord_id` 읽기 전용 fallback.
  **body의 어떤 member 식별자도 읽지 않는다.**
- `authorizeGameManage(gameId)`: 401(비로그인) / 404(없음) / 503(마이그레이션) / 403(권한) 판정 후
  `{ viewer, game }` 반환. 6개 쓰기 엔드포인트 전부 이걸로 교체했고 `requireGameManager()`는 제거됐다.
- 생성·참가는 `members.status === 'approved'` 필수(관리자도 members 행이 없으면 생성 불가).

### 검증 (계획 B-9)
과거 `now()-10분` 400 / `now()+90일` 400 / 활성 모집글 3개 제한 / `capacity` 2~100 /
`tft`+`team`이면 8 강제 / `title ≤60` / `game_kind_label ≤30`(`etc`일 때만, 그 외엔 null로 강제) /
`max_rounds` 1~20.

### 타임존 (계획 B-4)
클라이언트는 `scheduled_date: "YYYY-MM-DD"` + `scheduled_time: "HH:mm"` 만 보낸다.
서버의 `parseScheduledAt()`이 `new Date(\`${date}T${time}:00+09:00\`)`로 변환한다.
정규식으로 형식을 먼저 검증하고 `Invalid Date`도 거른다.

### 비-TFT 차단 (계획 B-5)
`rejectNonTftGame()`로 rounds / teams / guests(POST) / guests(DELETE)를 **400 차단**.
`findCommonMatch()`는 가드 이후에만 도달한다. 상세 GET의 팀 조회도 `game_kind==='tft'` 조건을 붙였다.

### 하드코딩 8 제거
guests 정원 검사 → `game.capacity`. teams는 4팀×2명 구조상 `TFT_TEAM_CAPACITY(8)` 상수를
유지하되 **확정 인원 기준**으로 세고, 수동 배정 시 확정 참가자가 아닌 대상이 섞이면 400으로 막는다.

### API 응답 파생 필드
- `GET /api/custom-games`: `confirmed_count`, `waitlist_count`, `guest_count`,
  `host_member_name`, `can_manage`, `my_participation{position, confirmed}`
- `GET /api/custom-games/[id]`: `confirmed[]`, `waitlist[]`, `participants[]`(기존 호환, 순번 순),
  각 참가자에 `position`·`confirmed`·`is_host`, 최상위에 `can_manage`, `my_participation`

---

## 4. ★ 마이그레이션 미적용 상태의 런타임 동작 (실측)

`20260725_custom_game_recruit.sql`은 **작성만 했고 실행하지 않았다.**
신규 컬럼 부재는 Postgres 42703으로 나타나며, 500이 아니라 **안내로 degrade**하도록 처리했다.

localhost:3000 실측 (비로그인):

| 요청 | 응답 |
|---|---|
| `GET /api/custom-games` | **200** `{"games":[],"migration_required":true}` (구 컬럼으로 fallback — 목록 화면 안 죽음) |
| `GET /api/custom-games/{id}` | **503** `{"error":"내전 모집 기능이 아직 활성화되지 않았습니다… (scripts/sql/20260725_custom_game_recruit.sql 미적용)","migration_required":true}` |
| `POST /api/custom-games` | **401** `{"error":"로그인이 필요합니다"}` |
| `POST\|DELETE /api/custom-games/{id}/join` | **401** |
| `PATCH /api/custom-games/{id}` | **401** |
| `DELETE /api/custom-games/{id}/participants/{pid}` | **401** |
| `POST /api/custom-games/{id}/end` | **401** |

즉 **500은 한 건도 발생하지 않는다.** 로그인 상태의 쓰기 요청은 401 대신 503(마이그레이션 안내)에
도달하며, 정상 동작은 SQL 실행 이후에만 검증 가능하다.

**SQL 먼저 → 배포 나중 순서를 반드시 지킬 것.**

---

## 5. QA에게 넘기는 주의사항 / 미구현

1. **DB 마이그레이션 미실행.** 계획 §8 B2 체크리스트(동시성 4종, 정원 강등/승격 등)는
   `scripts/sql/20260725_custom_game_recruit.sql` 실행 후에만 검증 가능하다.
2. **기존 UI는 B2 API와 계약이 어긋난다(B3 대상, 의도된 상태).**
   `app/custom-games/page.tsx`의 생성 모달은 아직 `participant_ids`/`guests`를 보내고
   `scheduled_date`·`capacity`를 보내지 않으므로, 마이그레이션 후에도 **생성이 400
   ("일자와 시간을 모두 입력하세요")로 실패한다.** 컴파일 에러는 없어 손대지 않았다.
   `loadMembers()`의 anon 직접 조회 제거도 B3 범위다.
3. **관리자라도 `members` 행이 없으면 내전을 만들 수 없다** (`host_member_id`를 채울 수 없어서).
   관리 권한(`canManageGame`)에는 영향 없다.
4. 게스트를 추가하면 확정 멤버 수가 그만큼 줄어든다(정원 하향과 동일한 UX 이슈, B-R12).
   B3에서 확인 다이얼로그를 붙이는 것을 권장한다.
5. 참가 취소 시 주최자 본인은 400으로 막힌다(내전 삭제를 안내).

---

## 6. 검증 결과

- `npx tsc --noEmit` — **통과** (에러 0)
- `npm run lint` — **통과** (에러 0. 경고 9건은 모두 기존 파일의 선행 경고이며 이번 변경과 무관)
- `npm run build` — **통과**. 신규 라우트 `/api/custom-games/[id]/join`,
  `/api/custom-games/[id]/participants/[participantId]` 정상 등록 확인
- `any` 사용 0건, catch는 전부 `catch (e)` 패턴 또는 `catch {}` (에러 객체 미사용 시)
- service role(`supabaseAdmin`)은 서버 라우트/`server-only` 모듈에서만 import
