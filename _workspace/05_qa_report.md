# QA 검증 결과 — Phase B1 / B2 / B3 (내전 권한 하드닝 + 모집/자율참가/대기열 + UI)

검증일: 2026-07-23
대상: `_workspace/01_analyst_plan.md` §8 QA 검증 포인트 중 B1/B2/B3 항목
전제: `scripts/sql/20260725_custom_game_recruit.sql` 실행 완료, dev 서버 localhost:3000 가동

## 종합 판정: ✅ 통과 (블로킹 결함 0건)

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 에러 0 |
| `npm run lint` | ✅ error 0 / warning 9 (전부 기존 파일 선행 경고, 내전 관련 0건) |
| `npm run build` | ✅ 통과. 신규 라우트 `join`, `participants/[participantId]` 등록 확인 |
| 로직 단위 검증 (a) | ✅ 26/26 pass |
| DB 제약 검증 (b) | ✅ 18/18 pass |
| RLS 검증 | ✅ 통과 |
| API E2E 검증 (세션 없이) | ✅ 22/22 pass |
| 코드 리뷰 (c) | ✅ 필수 항목 전부 충족. 경미 관찰 4건 |
| 비로그인 curl | ✅ 쓰기 13개 전부 401 JSON, `GET /api/custom-games` 200 |

**DB 원상복구:** 모든 테스트 시작·종료 시점에 `custom_games=0`, `custom_game_participants=0`,
`custom_game_guests=0`. `members=18`건 시종 미변경(읽기만 수행). 커밋·푸시 없음.

---

## (a) 로직 단위 검증 — `splitParticipants` / `canManageGame`

프로젝트에 테스트 파일을 남기지 않고 스크래치패드에서 `jiti`로 실제 소스를 직접 import해 실행했다
(검증 후 스크립트 삭제). **26/26 pass.**

### `lib/customGames/waitlist.ts` — `splitParticipants()`

| 케이스 | 기대 | 결과 |
|---|---|---|
| 정원 4 / 6명 | confirmed 4 (p1~p4), waitlist 2 (p5,p6) | ✅ |
| 입력 배열이 역순 | 함수 내부에서 재정렬 → 동일 결과 | ✅ |
| 동일 `joined_at` 3건 (`zz`,`aa`,`mm`), 정원 2 | id 오름차순 tie-break → `aa,mm` 확정 / `zz` 대기 | ✅ |
| 정원 6→3 하향 | p1~p3 확정, p4~p6 대기 | ✅ |
| 정원 3→6 상향 | 대기 3명 전원 확정 | ✅ |
| 확정 p2·p3 취소 (정원 4) | 승격 코드 없이 p1,p4,p5,p6 확정 / 대기 0 | ✅ |
| `capacity = 0` | 전원 대기 | ✅ |
| `capacity = -5` | 전원 대기 (음수 안전) | ✅ |
| `capacity = NaN` | 전원 대기 | ✅ |
| `capacity = Infinity` | 전원 대기 (`Number.isFinite` 실패 → size 0) | ✅ 안전측 fail-safe |
| `capacity = 3.7` | `Math.floor` → 3명 확정 | ✅ |
| 빈 배열 | 빈 결과 | ✅ |
| `joined_at`이 파싱 불가 문자열 | id fallback 정렬 | ✅ |

> `Infinity` → 확정 0명은 "전원 확정"이 아니라 "전원 대기"로 떨어진다. `capacity`는 DB CHECK로
> 2~100 정수가 보장되므로 도달 불가 경로이며, 방향도 안전측(과다 확정이 아니라 과소 확정)이다. 결함 아님.

`effectiveMemberCapacity(8,3)=5`, `(2,5)=0` (음수 방지) ✅

### `lib/customGames/authorize.ts` — `canManageGame()`

| 케이스 | 기대 | 결과 |
|---|---|---|
| `isAdmin=true` (host null, viewer null) | true | ✅ |
| **★ B-R2: host `null` + viewer `null`, 비관리자** | **false** | ✅ `null===null` 통과 경로 없음 |
| host `null` + viewer 있음 | false | ✅ |
| host 있음 + viewer `null` | false | ✅ |
| host === viewer | true | ✅ |
| host !== viewer | false | ✅ |

---

## (b) DB 제약 직접 검증 (service role)

검증 전 `custom_games=0 / custom_game_participants=0` → 검증 후 **`0 / 0`** (원상복구 확인).

### `custom_games` CHECK 제약 — 8/8 거부 확인

| INSERT | 결과 |
|---|---|
| `game_kind='invalid'` | ✅ 거부 |
| `game_kind='etc'` + 라벨 없음 | ✅ 거부 |
| `game_kind='etc'` + 라벨 `'   '`(공백) | ✅ 거부 (`btrim` 검사 동작) |
| `game_kind='etc'` + 31자 라벨 | ✅ 거부 |
| `game_kind='tft'` + 라벨 채움 | ✅ 거부 |
| `capacity=1` | ✅ 거부 |
| `capacity=101` | ✅ 거부 |
| `status='foo'` | ✅ 거부 |

### 정상 케이스가 막히지 않는지 — 3/3 성공

`tft`+cap4 / `etc`+라벨+cap100 / `lol`+cap2+`status='cancelled'` 전부 INSERT 성공.

### `custom_game_participants` 유니크 인덱스 (중복 신청 차단의 유일한 방어선)

| 시도 | 결과 |
|---|---|
| 1차 `(game, member)` INSERT | ✅ 성공 |
| **★ 동일 `(game, member)` 2차 INSERT** | ✅ **`23505` unique_violation으로 거부** |
| 다른 내전에 같은 멤버 INSERT | ✅ 성공 (스코프 정상) |

앱은 `isUniqueViolation()`으로 23505를 잡아 **409 `{"error":"이미 신청한 내전입니다"}`** 로 매핑한다
(`app/api/custom-games/[id]/join/route.ts:77-79`). 사전 select 검사에 의존하지 않는다. ✅

### RLS (B-R9 / B-10)

| 클라이언트/동작 | 결과 |
|---|---|
| anon SELECT `custom_game_participants` / `custom_games` | ✅ 허용 (select 정책만 존재) |
| anon INSERT `custom_game_participants` | ✅ **42501 거부** |
| anon DELETE `custom_game_participants` | ✅ 영향 0행 |
| anon INSERT `custom_games` | ✅ 거부 |
| anon UPDATE `custom_games` | ✅ 영향 0행 |

self-INSERT/DELETE/UPDATE 정책 없음 확인. 대기열 새치기(`joined_at` 조작) 벡터 차단됨.

### FK 정리

`custom_games` 삭제 시 `custom_game_participants` / `custom_game_guests` 자식 행이 DB 레벨에서
함께 제거됨을 확인 (잔여 0건, FK 에러 없음). `DELETE /[id]`가 명시적 자식 정리를 하지 않아도 안전.

---

## (b') 세션 없이 수행한 API E2E 검증 ★

`GET /api/custom-games`, `GET /api/custom-games/[id]`는 **비로그인 공개 엔드포인트**라는 점을 이용해,
service role로 데이터를 심고 → 실제 HTTP GET 응답의 파생 필드를 검증했다. 22/22 pass.
계획 §8 B2의 대기열 항목 대부분이 실제 API 응답 기준으로 검증됐다.

| 시나리오 | 검증 내용 | 결과 |
|---|---|---|
| 정원 4 / 6명 신청 | `confirmed_count=4`, `waitlist_count=2` | ✅ |
| | 상세 `confirmed[]` 4건 / `waitlist[]` 2건 | ✅ |
| | 확정 순서가 `joined_at` 오름차순과 정확히 일치 | ✅ |
| | 대기자 `position` = 5, 6 (전체 순번 유지) | ✅ |
| | 주최자만 `is_host=true` | ✅ |
| | `host_member_name` 정상 노출 | ✅ |
| | 비로그인 → `can_manage=false`, `my_participation=null` | ✅ |
| **확정 2·3번 취소** | 5·6번이 **승격 UPDATE 없이** 자동 확정, 확정 4 / 대기 0 | ✅ |
| **정원 4→2 하향** | 확정 2 / 대기 2 (강등 정상) | ✅ |
| **정원 2→6 상향** | 확정 4 / 대기 0 (승격 정상) | ✅ |
| **게스트 3명 추가 (정원 6)** | 확정 3 / 대기 1 — 게스트가 정원 소비 | ✅ |
| | 목록 `guest_count=3` | ✅ |
| `game_kind`를 `lol`로 전환 | 상세 GET 200, `teams` 빈 배열, 500 없음 | ✅ |
| 타임존 | `2026-08-01 21:00 KST` → `2026-08-01T12:00:00.000Z` (+09:00 고정) | ✅ |

---

## (c) 코드 리뷰 — 세션 필요로 실행 불가한 항목

| 검증 포인트 | 판정 | 근거 |
|---|---|---|
| `join`이 body의 member 식별자를 신뢰하지 않는가 | ✅ | `join/route.ts:72-74` — `viewer.member.id`만 사용. 파일 전체에 `body` 파싱 자체가 없다(`_req`) |
| `PATCH`가 `host_member_id`/`status` 제외 | ✅ | `[id]/route.ts:184-192` 명시 화이트리스트 타입. `patch` 객체에 두 키가 존재할 수 없다 |
| 강퇴가 `custom_game_id`로 스코프 | ✅ | `participants/[participantId]/route.ts:24-25`(조회), `43-44`(삭제) 모두 `.eq('custom_game_id', id)` 이중 적용 |
| 주최자 자기강퇴 금지 | ✅ | 강퇴: `:33-38` 400. 자발 취소: `join/route.ts:102-107` 400. 둘 다 `!== null` 가드 포함 |
| `game_kind!=='tft'` 서버 가드 (UI 숨김 아님) | ✅ | `rejectNonTftGame()` — rounds POST(`:21`), teams POST(`:33`), guests POST(`:30`), guests DELETE(`:16`). rounds는 **`findCommonMatch()` 호출 전**에 위치 |
| 과거 날짜 / 90일 초과 | ✅ | `constants.ts:74-79` (`SCHEDULE_PAST_GRACE_MS` 10분, `SCHEDULE_MAX_AHEAD_MS` 90일) |
| 활성 3개 제한 | ✅ | `route.ts:149-164`, `host_member_id` + `status in (recruiting,in_progress)` count |
| `approved` 검증 | ✅ | 생성 `route.ts:119-121`, 참가 `join/route.ts:49-51` (`isApprovedMember`) |
| 23505 → 409 매핑 | ✅ | `join/route.ts:77-79` (DB 검증에서 23505 실제 발생 확인) |
| 타임존을 서버에서 `+09:00` 고정 | ✅ | `parseScheduledAt()`이 유일한 변환 지점. `KST_OFFSET='+09:00'` |
| 클라이언트에 Date 변환 없음 | ✅ | `app/custom-games/page.tsx`, `[id]/page.tsx`에 `new Date(` **0건**. 표시는 `Intl.DateTimeFormat(timeZone:'Asia/Seoul')` 고정 인스턴스 |
| `tft`+`team` → capacity 8 강제 | ✅ | `parseCapacity()`가 입력을 무시하고 `TFT_TEAM_CAPACITY` 반환 |
| `any` 사용 | ✅ 0건 | `app/api/custom-games`, `lib/customGames`, `app/custom-games`, `app/page.tsx` grep 0 |
| catch 패턴 | ✅ | 전 코드베이스에 `catch (e: ` 0건 |
| service role이 클라이언트에 유입 | ✅ 없음 | `app/custom-games/**`에 `supabaseClient`/`supabaseAdmin`/`supabaseService` grep 0건 (B-R13 anon 직접 조회 제거 확인) |
| 대기자가 결과/팀 배정에 섞이지 않는가 | ✅ | rounds `:51-55`, teams `:70-78` 모두 `splitParticipants().confirmed`만 사용. 수동 배정은 `allowedIds`로 확정자 외 400 |

### 비로그인 curl (13개 쓰기 + 3개 읽기)

전부 `application/json`, HTML 리다이렉트 0건.

```
GET    /api/custom-games                      200  {"games":[]}
POST   /api/custom-games                      401  {"error":"로그인이 필요합니다"}   ← 비관리자 생성 허용 요구사항은 유지(requireAdmin 없음)
GET    /api/custom-games/{id}                 404  {"error":"내전을 찾을 수 없습니다"}
PATCH  /api/custom-games/{id}                 401
DELETE /api/custom-games/{id}                 401
POST   /api/custom-games/{id}/join            401
DELETE /api/custom-games/{id}/join            401
DELETE /api/custom-games/{id}/participants/x  401
POST   /api/custom-games/{id}/end             401
POST   /api/custom-games/{id}/rounds          401
POST   /api/custom-games/{id}/teams           401
POST   /api/custom-games/{id}/guests          401
DELETE /api/custom-games/{id}/guests/x        401
GET    /api/custom-games/{id}/teams           200  {"teams":[]}
GET    /api/custom-games/{id}/guests          200  {"guests":[]}
```

### B3 UI 코드 확인

- `app/custom-games/[id]/page.tsx:344` `isTft` 게이트가 게스트 추가(`:596,877,891,957`),
  라운드 추가(`:594`), 팀 배정(`:761,1011,1259`), 게스트 목록 전부를 감싼다.
  `:1172-1174`에 비-TFT 안내 문구.
- `app/custom-games/page.tsx:120-124` 생성 body가 `scheduled_date`/`scheduled_time`(문자열)/
  `capacity`/`game_kind`/`game_kind_label`. **`participant_ids`·`guests` 전송 0건** — B2 계약과 일치.
- `:92` `isTftTeam`이면 정원을 `TFT_TEAM_CAPACITY`로 고정.
- `app/page.tsx:97-106` 모집 중 count, **쿼리 에러 시 0으로 degrade**.

---

## 미검증으로 남는 항목 (Discord OAuth 전용 → 세션 생성 불가)

브라우저 로그인 후 수동 확인이 필요하다. 전부 코드 경로상 보장은 확인했으나 **실행 관찰은 못 했다**.

1. **비관리자·비주최자 로그인 세션의 403** — 6개 쓰기 엔드포인트 + PATCH + 강퇴.
   `authorizeGameManage()` → `canManageGame()` 경로는 (a)에서 단위 검증 완료.
2. **비관리자 로그인 세션의 `POST /api/custom-games` 200** (B1 요구사항 회귀 방지).
   해당 파일에 `requireAdmin`/`authorizeGameManage` grep 0건으로 코드상 확인.
3. **`pending` 멤버 생성/참가 403** — `isApprovedMember()` 코드 확인만.
4. **동시성 1~4** (동시 취소 2건 / 취소+신청 / 더블클릭 / 8명 동시 신청).
   - 동시성 3(더블클릭)은 **DB 유니크 인덱스 23505 거부로 사실상 검증됨** — 앱의 방어선이 인덱스 하나뿐이고 그것이 동작한다.
   - 동시성 1·2·4는 설계상 승격 UPDATE가 존재하지 않아(취소=DELETE 1건, 확정=순번 파생) 경합 지점 자체가 없다. 정원 변경/취소 후 재계산 결과는 (b')에서 실제 API로 확인했다.
5. **브라우저 타임존 변경(TZ=America/New_York) 시 표시 동일성** — `Intl` 포매터가 `timeZone:'Asia/Seoul'` 고정이므로 코드상 보장.
6. **UI 버튼 전환(참가 신청/대기 신청/참가 취소)** 실제 렌더 — 로그인 필요.

---

## 관찰 사항 (블로킹 아님, 수정하지 않음)

| # | 내용 | 심각도 | 비고 |
|---|---|---|---|
| O1 | `PATCH /[id]`가 `game_kind`를 `tft` → 비-TFT로 바꿀 수 있다. 이미 기록된 `custom_game_rounds`/`custom_game_teams`/`custom_game_guests`가 남은 채 UI에서 숨겨지고 rounds/teams/guests API는 400이 되어 정리 불가 상태가 된다 | 낮음 | 데이터 손상은 아니고 관리 불가 상태. "라운드가 있으면 `game_kind` 변경 거부" 한 줄이면 해소. 현재 UI 수정 모달은 `game_kind`를 보내지 않아 실사용 도달 경로 없음 |
| O2 | `guests/route.ts:35`, `teams/route.ts:39`의 `await req.json()`이 try/catch 밖 → 깨진 JSON 본문이면 500 | 낮음 | 인증 통과 후에만 도달. 다른 라우트(`POST /`, `PATCH`)는 try/catch 적용됨 |
| O3 | 활성 3개 제한(`route.ts:149`)과 신청 상한(`join/route.ts:61`)은 앱 count라 동시 요청 시 초과 가능 | 낮음 | 계획 §B-3에서 "정확도 요구 낮아 앱 count로 충분"으로 이미 수용된 설계 |
| O4 | `getViewerMember()`가 GET 목록마다 `requireAdmin()`(추가 DB 조회)을 호출 | 낮음 | 성능 관찰만 |

---

## 결론

- **B1**: 6개 쓰기 엔드포인트 권한 가드 적용 확인. 생성 예외 유지 확인. 비로그인 401 JSON 전수 확인.
- **B2**: 대기열 순번 파생 설계가 단위·API E2E 양쪽에서 정확히 동작. 중복 신청 차단 유니크 인덱스
  실동작(23505→409) 확인. CHECK 제약 8종·RLS 전부 의도대로 동작. `canManageGame`의 B-R2 방어 확인.
- **B3**: 비-TFT 섹션 서버·UI 이중 차단, 클라이언트 타임존 변환 부재, anon 직접 조회 제거 확인.
- 자동 검증 3종(tsc/lint/build) 전부 통과, `any` 0건, catch 패턴 준수.

**커밋·푸시하지 않았다.** 운영 데이터 변경 없음(`members` 18건 미변경, 내전 테이블 0건 → 0건).
