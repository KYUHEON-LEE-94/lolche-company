# QA 리포트 — 멤버 자가 등록/승인/추방

## 전제
DB 마이그레이션(`scripts/sql/20260723_member_self_registration.sql`) 미실행 상태.
`members.status`, `hall_of_fame.member_name_snapshot` 컬럼이 아직 DB에 없으므로
런타임 E2E(등록→승인→랭킹 노출, 추방)는 검증 불가. 정적·보안 검증 위주로 수행.

## 자동 검증

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 에러 0 |
| `npm run lint` | ✅ error 0 (warning 9건 — 전부 기존 파일의 `<img>`/exhaustive-deps) |
| `npm run build` | ✅ 통과. `/api/me/member`, `/api/admin/members/*`, `/auth/callback` 라우트 정상 등록 |
| `grep ": any\|as any"` | ✅ 0건 |
| `grep "catch (e: any)"` | ✅ 0건 |

## DB 실측 결과 반영 (사용자 제공 CSV 3종)

계획에서 "확인 필요"로 남았던 항목이 **둘 다 실재하는 위험**으로 확정됨.

| 항목 | 실측값 | 영향 |
|---|---|---|
| `hall_of_fame_member_id_fkey` | **ON DELETE CASCADE** | 멤버 삭제 시 과거 시즌 기록 영구 소실. STEP 4(SET NULL) 필수로 격상 |
| `members_update_own` RLS | `auth.uid() = user_id`, 컬럼 제한 없음 | 사용자가 콘솔에서 자기 `status`를 approved로 변경 가능 (권한 상승). STEP 5 필수 |
| `members_select_all` RLS | `true` (SELECT) | 공개 랭킹에 필요 — 유지 |
| `hall_of_fame` 스냅샷 컬럼 | 없음 | STEP 3에서 추가 |
| `hall_of_fame.queue_type` | NOT NULL | types/supabase.ts 누락분 보정 완료 |
| 나머지 FK 6종 | 제약명이 SQL 파일과 전부 일치 | STEP 4 그대로 실행 가능 |

→ SQL 파일의 STEP 4를 "권장" → **"필수"**로, STEP 5의 정책명 placeholder를 실제 이름
`members_update_own`으로 치환 완료.

## 발견·수정한 결함 1건

**🟠 스냅샷 실패를 무시하고 삭제를 진행 — `app/api/admin/members/[id]/route.ts`**

`hall_of_fame` 스냅샷 UPDATE의 에러를 `IGNORABLE_PG_CODES`(42P01, 42703)로 흘려보내고 있었다.
마이그레이션 STEP 3 미실행 상태에서 추방을 실행하면:

1. 스냅샷 UPDATE가 42703(컬럼 부재)으로 실패 → 무시됨
2. `member_id`가 null로 바뀌지 않은 채 members DELETE 진행
3. FK가 **CASCADE**이므로 hall_of_fame 행이 함께 삭제 → **과거 시즌 기록이 경고 없이 소실**

스냅샷 실패 시 삭제를 중단하도록 수정하고, 42703인 경우 STEP 3 실행을 안내하는 메시지를 붙였다.

## 보안 코드 리뷰 (계획 6절 대조)

| 검증 포인트 | 결과 | 근거 |
|---|---|---|
| body의 `id`를 신뢰하지 않는가 | ✅ | `route.ts:85-90` — 대상 행을 `.eq('user_id', user.id)`로만 특정. body의 id는 어디서도 읽지 않음 |
| status/approved_by/riot_puuid 주입 차단 | ✅ | `lib/members/memberInput.ts:21-48` 화이트리스트 파서가 3개 키만 반환. UPDATE/INSERT는 파서 결과만 사용 |
| 타입 강제변환 우회 | ✅ | `asString()`이 non-string을 `''`로 떨궈 `[object Object]` 통과 차단 |
| 길이 검증이 trim 이후 | ✅ | 28-30행 trim → 35-43행 길이 검사 |
| 태그라인 포맷 | ✅ | `/^[A-Za-z0-9]{2,10}$/`, 선행 `#` 제거 |
| Riot ID 변경 시 pending 복귀 | ✅ | `route.ts:100-103` — `isSameRiotId` 비교 후 `REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE` 플래그로 분기 |
| 관리자 API requireAdmin 첫 줄 | ✅ | GET `/api/admin/members`, approve, reject, DELETE 전부 첫 줄 |
| `/api/members/[id]/sync` 인증 | ✅ | 세션 확인 → **DB에서 읽은** `member.user_id`와 대조 → 불일치 시 requireAdmin. 클라이언트 입력에 의존하지 않음 |
| DELETE confirmName | ✅ | `member_name` 정확히 일치할 때만 진행 |
| DELETE 순서 | ✅ | hall_of_fame 스냅샷+링크해제 → 자식 6종(리프→루트) → members. FK 설정과 무관하게 성립 |
| `.eq('status','approved')` 필터 | ✅ | `app/page.tsx:14`, `app/custom-games/page.tsx:97` |
| discord_id 중복 연결 차단 | ✅ | `route.ts:150` — 다른 user_id 연결 시 409 |

## 남은 리스크 (비차단)

- **DELETE가 트랜잭션이 아니다.** 자식 테이블 정리 도중 실패하면 일부만 삭제된 상태로 남는다. 재실행하면 이어서 진행되므로 복구는 가능하나, 완전한 원자성이 필요하면 Postgres 함수(RPC)로 옮겨야 한다.
- **RLS STEP 5 미실행 시 권한 상승이 그대로 남는다.** 코드는 모든 members 쓰기를 service role로 옮겼지만, 정책이 살아 있으면 사용자가 브라우저에서 직접 UPDATE할 수 있다. 코드로 대체 불가.
- 마이그레이션 전 배포 시 홈/명예의 전당이 컬럼 부재로 깨진다. **SQL 먼저 → 배포 나중** 순서 필수.

## 마이그레이션 실행 후 재검증 (2026-07-23 완료)

| 항목 | 결과 |
|---|---|
| `members.status` 컬럼 + 기존 멤버 approved 백필 | ✅ |
| `hall_of_fame.member_name_snapshot` + 백필 | ✅ (마이즈즈 94, 지성 02 등 확인) |
| `members` RLS 정책 | ✅ `members_select_all`만 남음 — UPDATE 정책 제거 확인, 권한 상승 차단 |
| `hall_of_fame_member_id_fkey` | ✅ ON DELETE SET NULL — 추방 시 기록 보존 |
| 페이지 렌더 `/`, `/login`, `/hall-of-fame`, `/custom-games` | ✅ 200, 회귀 없음 |
| `/profile` 비로그인 | ✅ 307 → 로그인 |
| 비로그인 `POST /api/me/member` | ✅ 401 |
| 비로그인 approve / DELETE / `GET /api/admin/members` | ✅ 403 |
| 비로그인 `POST /api/members/[id]/sync` | ✅ 401 (기존 무인증 결함 수정 확인) |

## 미검증 (로그인 세션 필요 — 사용자 직접 확인 권장)

계획 6절의 런타임 항목 — 등록→pending→승인→랭킹 노출, 거절→재신청, 추방 후
`/hall-of-fame` 스냅샷 렌더, 콘솔에서 `update({status:'approved'})` 직접 실행 차단 확인.
