# 구현 결과 — 멤버 자가 등록 / 승인 / 추방

## 검증 상태

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 (에러 0) |
| `npm run lint` | ✅ 통과 (에러 0, 경고 9 — 전부 기존 코드의 `<img>` / exhaustive-deps 경고) |
| `npm run build` | ✅ 통과 |

> **DB에는 아무것도 쓰지 않았습니다.** 마이그레이션은 `scripts/sql/`에 파일로만 생성했습니다.

---

## 1. 마이그레이션 SQL

**경로:** `scripts/sql/20260723_member_self_registration.sql`

파일 안에 STEP별 목적·롤백 방법이 주석으로 들어 있습니다. 실행 순서:

| STEP | 내용 | 필수 여부 |
|---|---|---|
| 0 | 사전 확인 (FK 정의 / RLS 정책 / hall_of_fame 컬럼 / Riot ID 중복) — 읽기 전용 | 먼저 실행 |
| 1 | `members`에 `status`(default `'approved'`), `requested_at`, `approved_at`, `approved_by`, `rejected_reason` 추가 + CHECK 제약 + 인덱스 | **필수** |
| 2 | 기존 멤버 `status='approved'` 백필 | **필수** |
| 3 | `hall_of_fame`에 `member_name_snapshot`, `profile_image_snapshot` 추가 + 기존 행 백필 | **필수** |
| 4 | `members` 참조 FK 7개 재정의 (hall_of_fame/tft_match_participants/sync_logs/custom_game_teams → SET NULL, member_rank_history/custom_game_participants/custom_game_results → CASCADE) | 권장 (미적용해도 코드 동작) |
| 5 | `members`의 self-UPDATE RLS 정책 제거 | **보안상 필수** (STEP 0-2 결과로 실제 정책명 확인 후) |
| 6 | (선택) Riot ID 중복 방지 유니크 인덱스 — 주석 처리해 둠 | 선택 |
| 7 | 검증 쿼리 | 권장 |

### ⚠ 반드시 지켜야 할 순서: **SQL 먼저 → 배포 나중**

코드가 다음 컬럼을 이미 참조합니다. STEP 1~3 전에 배포하면 해당 화면이 깨집니다.
- `members.status` → 홈(`/`), `/custom-games`, `/admin/members/control`, `/profile`
- `hall_of_fame.member_name_snapshot`, `profile_image_snapshot` → `/hall-of-fame`, 시즌 아카이브

---

## 2. 사용자가 직접 해야 할 작업

1. `scripts/sql/20260723_member_self_registration.sql`의 **STEP 0**을 Supabase SQL Editor에서 실행하고 결과 확인
   - 0-1: FK 실제 이름 → STEP 4의 `conname`이 다르면 치환
   - 0-2: **members의 UPDATE 정책 이름** → STEP 5의 `drop policy` 문에 치환 (가장 중요)
   - 0-4: Riot ID 중복 → STEP 6 적용 여부 판단
2. **STEP 1 → 2 → 3** 실행 (필수)
3. **STEP 5** 실행 — `members`에 UPDATE 정책이 남아 있으면 사용자가 브라우저 콘솔에서 자기 `status`를 `approved`로 바꿀 수 있습니다. 이 하나가 안 되면 승인 워크플로 전체가 무력화됩니다.
4. STEP 4(권장), STEP 6(선택) 판단 후 실행
5. 배포
6. 배포 후 STEP 7 검증 쿼리로 `status` 분포 확인

---

## 3. 신규 파일

| 파일 | 내용 |
|---|---|
| `scripts/sql/20260723_member_self_registration.sql` | 마이그레이션 (실행 안 함, 파일만) |
| `lib/members/memberInput.ts` | 입력 화이트리스트 파서 + 길이/포맷 상수. **3개 컬럼만** 추출하므로 `status`/`approved_by`/`riot_puuid` 등이 페이로드에 섞여도 통과 값에 포함되지 않음 |
| `app/api/me/member/route.ts` | GET 내 멤버 조회 / POST 자가 등록·수정 |
| `app/api/admin/members/route.ts` | GET 관리자 멤버 목록 (`?status=pending` 지원) |
| `app/api/admin/members/[id]/approve/route.ts` | 승인 + 즉시 동기화 |
| `app/api/admin/members/[id]/reject/route.ts` | 거절 + 사유 |
| `app/profile/MemberSelfForm.tsx` | 라이엇 ID 등록/수정 폼 (Client Component) |

## 4. 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `types/supabase.ts` | `MemberStatus` export, `Member`에 status 계열 5개 컬럼 추가, `HallOfFame`에 누락됐던 `queue_type` + 스냅샷 2개 추가 |
| `app/api/admin/members/[id]/route.ts` | DELETE 전면 재작성 — `confirmName` 일치 검증, hall_of_fame 스냅샷 보존 후 링크 해제, 자식 테이블 6종 명시적 정리 |
| `app/api/admin/members/create/route.ts` | `parseMemberInput` 사용, `status:'approved'` + `approved_at`/`approved_by` 명시 |
| `app/api/admin/members/update/route.ts` | `parseMemberInput` 사용, status는 건드리지 않음 |
| `app/api/members/[id]/sync/route.ts` | **무인증 결함 수정** — 로그인 필수 + `member.user_id === user.id` 또는 `requireAdmin()` |
| `app/api/profile/image/route.ts` | members UPDATE를 `supabaseService` 경유로 전환 (`.eq('user_id', user.id)` 유지) |
| `app/api/profile/frame/route.ts` | 동일 (해제/설정 두 경로 모두) |
| `app/profile/page.tsx` | status 분기 — 미등록/pending/rejected면 폼만, approved면 폼 + ProfileEditor. service role 조회 + discord_id fallback |
| `app/profile/ProfileEditor.tsx` | `auth.uid` 출력 debug `console.log` 제거 (2곳) |
| `app/admin/members/control/page.tsx` | 대기/전체 탭, status·로그인 연결 배지, 승인/거절 버튼, 멤버명 타이핑 확인 삭제 모달. 데이터 소스를 브라우저 Supabase 직접 조회 → `/api/admin/members`로 교체 |
| `app/page.tsx` | `.eq('status','approved')` 추가 |
| `app/custom-games/page.tsx` | `.eq('status','approved')` 추가 |
| `lib/actions/season-actions.ts` | 아카이브 시 `member_name_snapshot`/`profile_image_snapshot` 저장 |
| `app/hall-of-fame/page.tsx` | 스냅샷 컬럼 select, 임베디드 조인 결과 정규화(`*` → 명시 컬럼) |
| `app/hall-of-fame/_components/Podium.tsx` | `rankerName()`/`rankerImagePath()` fallback 헬퍼 추가 및 적용 |
| `app/hall-of-fame/_components/HallOfFameClientPage.tsx` | `rankerName()` 적용 |
| `CLAUDE.md` | 자가 등록/승인 워크플로 섹션, 디렉토리 구조, DB 테이블, 주의사항 갱신 |
| `app/admin/AdminLayoutShell.tsx` | **삭제** (미사용 죽은 코드, `git rm`) |

---

## 5. 보안 요구사항 이행

| 요구 | 이행 방식 |
|---|---|
| body의 `id` 불신 | `app/api/me/member/route.ts` POST가 `.eq('user_id', user.id)`로만 대상 행 특정. body에서 `id`를 읽지 않음. UPDATE에도 `.eq('user_id', user.id)` 이중 조건 |
| 권한 컬럼 화이트리스트 | `parseMemberInput()`이 `member_name`/`riot_game_name`/`riot_tagline` 3개만 반환. `status` 등은 서버가 자체 계산한 값만 병합 |
| Riot ID 변경 시 pending 복귀 | `REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE = true` 상수로 분리. `isSameRiotId()` 대소문자 무시 비교 |
| 관리자 API 첫 줄 requireAdmin | `/api/admin/members` GET, approve, reject, DELETE, create, update 전부 첫 줄 |
| sync 무인증 결함 | 로그인 401 → 소유자 아니면 requireAdmin → 실패 시 403 |
| 입력 검증 | 50/30/10자 + trim 빈값 거부 + 태그라인 `/^[A-Za-z0-9]{2,10}$/`. 거절 사유 200자 |

추가 방어:
- `/api/admin/members` 응답에서 `user_id`/`discord_id` 원본을 노출하지 않고 `login_linked`/`discord_registered` 불리언으로만 전달
- 자가 등록 시 discord_id가 **다른 user_id에 이미 연결**돼 있으면 409 반환 (계정 탈취 방지, 기존 auth/callback 정책과 일관)
- `/api/me/member` GET의 discord_id fallback도 타인 연결 행은 노출하지 않음

---

## 6. 미확인 사항(FK / RLS)이 코드에 미치는 영향

### FK — 영향 없음 (방어적 구현)

`DELETE /api/admin/members/[id]`가 FK의 `ON DELETE` 동작에 의존하지 않습니다.

```
1) hall_of_fame  : UPDATE member_id=null + 이름/이미지 스냅샷  (삭제하지 않음)
2) 자식 테이블 6종 : 리프→루트 순으로 명시적 DELETE
   custom_game_results → custom_game_teams → custom_game_participants
   → member_rank_history → tft_match_participants → sync_logs
3) members       : DELETE
```

- FK가 `NO ACTION`이어도 자식이 먼저 비워지므로 23503이 나지 않습니다.
- `CASCADE`여도 이미 비어 있어 무해합니다.
- 테이블/컬럼이 없는 환경(PG 코드 `42P01`/`42703`)은 "정리할 대상 없음"으로 간주하고 무시합니다.
- **다만** `hall_of_fame`의 FK가 `ON DELETE CASCADE`로 되어 있으면 3)단계에서 기록이 함께 삭제됩니다. STEP 0-1에서 CASCADE가 확인되면 **STEP 4를 반드시 실행**해 SET NULL로 바꿔주세요. 이것이 STEP 4가 필요한 유일한 실질 사유입니다.
- `member_rank_history.member_id`는 NOT NULL이므로 코드가 삭제하는 방식만 가능합니다(SET NULL 불가).

### RLS — 코드는 정책 유무와 무관하게 동작, 단 보안은 SQL에 의존

계획 R1대로 **모든 members 쓰기 경로를 service role로 전환**했습니다.

| 경로 | 이전 | 현재 |
|---|---|---|
| 프로필 이미지 저장 | anon + 사용자 세션 | `supabaseService` + `.eq('user_id', user.id)` |
| 프레임 저장/해제 | anon + 사용자 세션 | `supabaseService` + `.eq('user_id', user.id)` |
| 자가 등록/수정 | (신규) | `supabaseService` + `.eq('user_id', user.id)` |
| `/profile` 멤버 조회 | anon 세션 | `supabaseService` (self-SELECT 정책 유무 무관) |
| `/admin/members/control` 목록 | 브라우저 anon 직접 조회 | `/api/admin/members` (requireAdmin) |

→ **RLS의 self-UPDATE 정책이 남아 있어도 기능은 정상 동작하지만, 그 경우 권한 상승 취약점이 그대로 남습니다.** 정책 제거(STEP 5)는 코드로 대체할 수 없고 SQL 실행이 유일한 해결책입니다. 마이그레이션 파일 STEP 5에 배경 설명과 후보 정책명, 제거 후 재확인 쿼리를 주석으로 넣어 두었습니다.

### `hall_of_fame.queue_type`

`types/supabase.ts`에 누락돼 있던 것을 추가했습니다. 코드(`season-actions.ts`, `hall-of-fame/page.tsx`)는 이미 사용 중이었으므로 실제 DB에는 존재할 가능성이 높지만, STEP 0-3으로 확인해 주세요. 없다면 아래를 추가 실행해야 합니다.

```sql
alter table public.hall_of_fame add column if not exists queue_type text;
```

---

## 7. 미구현 / 범위 외

| 항목 | 사유 |
|---|---|
| `app/admin/layout.tsx` 대기 건수 배지 (계획 14) | 선택 항목. 배지를 위해 레이아웃을 서버 컴포넌트로 바꾸거나 클라이언트 폴링을 추가해야 해 비용 대비 이득이 낮다고 판단. control 페이지 탭에 `대기 중 (N)`으로 표시됨 |
| STEP 6 유니크 인덱스 | 기존 중복 데이터 여부를 확인할 수 없어 SQL에서 주석 처리. 사용자가 0-4 확인 후 판단 |
| `app/components/ranking/HallOfFameCard.tsx` | 어디서도 import되지 않는 죽은 코드. 자체 로컬 타입을 쓰고 있어 이번 변경의 영향을 받지 않음. 범위 외로 두고 삭제하지 않음 |
| 시즌 관리 | 지시대로 손대지 않음 (`season-actions.ts`의 아카이브 스냅샷 추가는 명예의 전당 보존을 위한 필수 변경이라 예외) |

---

## 8. QA 테스트 시 집중 항목

1. **STEP 1~3 SQL 실행 전에는 홈/명예의 전당이 깨집니다.** 반드시 SQL 먼저 실행 후 테스트
2. `POST /api/me/member`에 `status:'approved'`, `approved_by`, `riot_puuid`, `tft_tier`, 타인의 `id`를 섞어 전송 → 전부 무시되고 자기 행만 pending으로 남는지
3. 브라우저 콘솔 `supabaseClient.from('members').update({status:'approved'})` → **반드시 실패**해야 함 (STEP 5 실행 여부 검증)
4. 승인된 멤버가 Riot ID 변경 → pending 복귀 + 홈 랭킹에서 사라지는지
5. 존재하지 않는 Riot ID 승인 → 승인은 성공하고 `syncWarning` 메시지가 뜨는지 (500 아님)
6. 추방 모달에서 멤버명 오타 → 400 거부 / 정확 입력 → 삭제 후 `/hall-of-fame`이 스냅샷 이름으로 렌더되는지
7. 비로그인 `POST /api/members/[id]/sync` → 401, 타인 멤버 → 403
8. 프로필 이미지·프레임 저장이 service role 전환 후에도 정상인지

---

## 부분 보완 (A안: 기존 멤버 행 인계)

### 배경
Discord OAuth 전환 이전부터 있던 멤버 18명 중 15명은 `members.discord_id`가 null이라
`auth/callback`의 `linkDiscordAccount`가 매칭에 실패한다. 이 상태로 `/profile`에서 신청하면
`POST /api/me/member`가 **새 행을 INSERT**해 같은 사람이 두 행으로 쪼개지고,
기존 행의 랭크·매치 기록이 새 행에 붙지 않는다.

### 변경 파일

| 파일 | 변경 내용 |
|---|---|
| `app/api/me/member/route.ts` | 신규 INSERT 직전, 라이엇 게임명+태그라인이 일치하는 기존 행을 찾아 본인 것으로 인계 |
| `app/profile/MemberSelfForm.tsx` | 신규 신청 시에만 노출되는 안내 문구 1줄 추가 (UI 구조 변경 없음) |

### 구현 상세 — `findClaimableRow()` + 인계 분기

POST 흐름에서 **(1) 세션 `user_id` 조회 → (2) `discord_id` 조회 → (3) 신규 인계 조회 → (4) INSERT** 순서.
(3)이 이번에 추가된 단계이며 (1)(2)가 모두 실패했을 때만 실행된다.

**매칭 규칙**
- `.ilike('riot_game_name', 값)` + `.ilike('riot_tagline', 값)` — 와일드카드 없이 사용해 대소문자 무시 동등 비교.
- 다만 사용자 입력에 `%`/`_`/`*`가 섞이면 패턴으로 해석되므로, 조회 결과를 다시
  `toLowerCase()` 정확 일치로 한 번 더 거른다. (와일드카드 주입으로 남의 행을 끌어오는 것 차단)

**소유권 판정**
- 매칭된 행 중 `user_id`가 **null인 행만** 인계 대상.
- null 행이 하나도 없으면 → **409** `이미 다른 계정에 연결된 라이엇 ID입니다.`
- 매칭 행의 `discord_id`가 세션 Discord와 다르면 → **409** (관리자가 타인 Discord로 사전 등록해 둔 행 보호)
- 세션 `user_id`와 같은 행은 (1)단계에서 이미 잡히므로 정상 수정 흐름을 탄다.

**인계 시 기록**
```
user_id = 세션 user.id, discord_id = 세션 discord id
member_name / riot_game_name / riot_tagline = 사용자 입력값
status = 'pending', requested_at = now
approved_at = null, approved_by = null, rejected_reason = null
```
→ 관리자 재승인을 반드시 거치게 한다. 남의 행 가로채기 시도를 관리자가 걸러야 하기 때문.

**TOCTOU 가드**
UPDATE 쿼리에 `.is('user_id', null)`를 걸고 `.select('id')`로 실제 갱신 행 수를 확인한다.
0건이면 조회~갱신 사이에 다른 사용자가 먼저 인계한 것이므로 409로 거절한다.
(기존 `discordRow` 분기와 동일한 방어 패턴)

**응답 구분**
인계 성공 시 `{ ok: true, status: 'pending', linked: true, message: '기존 멤버 정보에 연결했습니다. 관리자 승인 후 랭킹에 표시돼요.' }`
— 신규 신청(`신청이 접수되었습니다...`)과 문구로 구분된다.

### 보안 불변식 유지 확인
- body의 `id`는 여전히 읽지 않는다. 인계 대상은 **사용자가 입력한 Riot ID + user_id null** 조건으로만 특정.
- `parseMemberInput()` 화이트리스트 3컬럼 그대로. `status`/`approved_by`/`riot_puuid` 등은 서버 계산값만 병합.
- `any` 미사용, catch 패턴 유지, select는 필요한 컬럼만 지정.

### 제약 준수
- **DB 쓰기 작업 없음.** 스키마 변경 없으므로 마이그레이션 파일도 추가하지 않았다.

### 검증
| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 (에러 0) |
| `npm run lint` | ✅ 통과 (에러 0, 경고 9 — 전부 기존 코드의 `<img>`/exhaustive-deps, 이번 변경과 무관) |

### QA 추가 확인 항목
1. `discord_id`/`user_id`가 모두 null인 기존 멤버의 Riot ID로 신규 신청 → 새 행이 생기지 않고 기존 행이 pending으로 전환되는지 (`select count(*) from members` 불변)
2. 대소문자를 바꿔 입력 (`Hide on bush` vs `HIDE ON BUSH`) → 동일하게 인계되는지
3. 이미 다른 user_id가 연결된 멤버의 Riot ID로 신청 → **409**, 그 행이 전혀 변경되지 않는지
4. 게임명에 `%` 또는 `_`를 넣어 신청 → 엉뚱한 행이 인계되지 않고 신규 INSERT되는지
5. `윤 쨈 98`처럼 옛 이메일 계정 uuid가 `user_id`에 남아 있는 행 → 인계 대상이 아니므로 **409**. 관리자가 SQL로 `user_id`를 null로 비워준 뒤 재시도해야 정상 인계됨 (운영 안내 필요)
6. 인계 후 관리자 승인 → 기존 랭크·매치 기록이 그대로 유지된 채 홈 랭킹에 노출되는지
