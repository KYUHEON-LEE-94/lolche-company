# 기능 개선 진행 기록 (2026-10-08)

2026-10-08 코드 점검(백엔드 동기화·크론·푸시 / 프론트 화면) 결과를 추천 순서대로 반영한 기록.
각 배치는 `lolche-dev` 파이프라인(Analyst → Developer → QA)으로 처리한다.

## 진행 현황

| # | 배치 | 항목 | 상태 | 커밋 |
|---|---|---|---|---|
| 1 | A | 부계정 1개 실패가 멤버 전체 동기화를 멈춤 + 부계정 등록 시 존재 검증 없음 | ✅ 완료 | `1a20fd2` |
| 2 | A | sync-all 이 실패 멤버에 막힘(id 순 정렬) + rejected 멤버도 동기화 | ✅ 완료 | `1a20fd2` |
| 3 | A | 매 동기화마다 매치 상세 5건 재다운로드 + 공백 구간 매치 영구 누락 | ✅ 완료 | `1a20fd2` |
| 4 | B | 내전 대기 순번 오표시(목록·토스트) | ✅ 완료 | 배치 B 커밋 |
| 5 | B | 내전 생성/수정 모달 에러가 오버레이 뒤에 숨음 | ✅ 완료 | 배치 B 커밋 |
| 6 | B | 주최자에게 실패하는 '참가 취소' 노출 + 상세 페이지 삭제 버튼 없음 | ✅ 완료 | 배치 B 커밋 |
| 7 | C | TOP5 진입 알림 반복 발송 | ⏳ 대기 | |
| 8 | C | 내전 일정 변경 시 리마인더 재무장 안 됨 | ⏳ 대기 | |
| 9 | C | 동기화 재시도 시 `tft_*_prev` 덮어써 승급 알림 유실 | ⏳ 대기 | |
| 10 | C | 수동 동기화 쿨다운이 성공 기준 + 동시 실행 가드 없음 | ⏳ 대기 | |
| 11 | D | `/tft` 동기화 성공 후 카드 미갱신 | ⏳ 대기 | |
| 12 | D | 푸시 토글: 서버 등록 실패해도 "켜짐" | ⏳ 대기 | |
| 13 | D | 내전 상세 모바일 헤더 넘침 + 매 조작마다 전체 스피너 | ⏳ 대기 | |
| 14 | D | 스팀 연결/해제 후 개인화 섹션 미갱신 | ⏳ 대기 | |
| 15 | D | 랭킹 행·내전 카드 키보드 접근 불가 | ⏳ 대기 | |
| 16 | D | sw.js 알림 클릭 시 새 창 + 로그아웃 시 구독 미해제 | ⏳ 대기 | |
| 17 | C | 디스코드 30분 알림이 `in_progress` 내전 제외(푸시와 불일치) | ⏳ 대기 | |
| 18 | C | 내전 목록 GET 무제한 조회(1000행 절단 위험) | ⏳ 대기 | |

## 사전 정리

- `_workspace_prev*` 백업 폴더 6개 + 빈 `tmp/` → 휴지통 이동. 이 폴더들은 `.gitignore` 추가 전에 커밋돼 추적 중이었으므로 git 에서도 삭제 커밋(히스토리로 복구 가능).
- 기존 `_workspace/` → `_workspace_prev_20261008/` 로 보관 후 새 작업 공간 생성.
- `output/` 은 개인 파일 가능성이 있어 보류.

## 배치별 상세

(각 배치 완료 시 아래에 변경 파일·결정 사항·검증 결과를 추가한다.)

### 배치 A — 동기화/크론 안정성 (#1~#3)

커밋: `fix: 부계정 실패 격리·sync-all 기아 해소·매치 증분 수집 — 잘못된 Riot ID 하나가 동기화를 멈춘다`

**문제**
- #1 계정 루프가 부계정 리그 조회 실패에도 throw → 멤버 전체 동기화 실패(대표 랭크·매치까지 중단). 등록 시 Riot ID 존재 검증이 없어 오타 계정이 그대로 저장됐다.
- #2 `sync-all` 이 `id` 순 고정 정렬 + 실패 멤버를 매번 재선정 → 잘못된 Riot ID 멤버가 배치 슬롯을 잠식(뒤쪽 멤버 기아). `rejected` 멤버도 동기화 대상이었다.
- #3 매 동기화마다 최근 5판 상세를 재다운로드(건당 1.2초), 동기화 공백 동안 5판을 넘게 플레이하면 그 사이 매치가 영구 누락.

**변경 파일**
| 파일 | 내용 |
|---|---|
| `lib/sync/doSyncMember.ts` | 대표 먼저 순회, 부계정 실패는 `console.warn` 후 건너뜀(행 update 없음, 429면 남은 부계정 중단). 매치 ID lookback 20 + 기적재 skip + 신규 상세 상한 5. `tft_recent5` DB 기준 재계산(값이 다를 때만 update) |
| `lib/riot/verifyRiotId.ts` (신규) | `server-only`. `verifyRiotId()` → ok / not_found(404·400) / unverified |
| `app/api/me/riot-accounts/route.ts` | POST: 없는 ID 400, 해석 puuid 즉시 저장 |
| `app/api/me/riot-accounts/[id]/route.ts` | PATCH: 없는 ID 400(DB 무변경), 해석 puuid 저장. `CLEARED_RANK_COLUMNS`(lol_puuid:null)·LEGACY 폴백 유지 |
| `app/api/me/member/route.ts`, `app/api/admin/members/create|update/route.ts` | Riot ID가 실제로 바뀔 때만 members 쓰기 이전에 not_found 400 |
| `app/api/admin/sync-all/route.ts` | 선정 = fresh ∪ failed(백오프 경과) ∪ stuck running, `status≠rejected`, `last_sync_started_at asc nulls first, id` 정렬, cursorId 무시 |
| `app/admin/members/sync/page.tsx` | 전체 동기화 루프 최대 50회 |
| `CLAUDE.md` | 환경변수 3종 + '동기화 부하' 절 설명 |

**주요 결정**
- **Riot 장애 시 등록 허용:** 429·5xx·키 미설정·네트워크 오류는 `unverified` 로 등록을 막지 않고 `riot_puuid=null` 저장(기존 동작). 사용자 요청 경로라 재시도 없음. 404/400만 거절.
- **cursorId 무시:** `last_sync_started_at` 정렬과 id 커서는 공존 불가. 처리된 멤버는 success(stale 아님)/failed(백오프)/running(최근 시작)으로 자연 제외되므로 같은 조건 반복 조회로 진행이 보장된다. 응답의 `nextCursorId`/`done` 은 화면 루프 호환을 위해 유지.
- **recent5 쿼리 부모 변경:** 계획의 `tft_matches` 부모 + `tft_match_participants!inner` 임베드 필터는 실DB에서 statement timeout(**57014**). 부모를 `tft_match_participants`(`member_id` 필터)로 바꾸고 `order('tft_matches(game_datetime)')` to-one 정렬 사용.
- **member_id 기준:** 대표 전환 직후 이전 대표 계정 판이 섞일 수 있으나, puuid 기준이면 키 교체·puuid 재발급 시 이력이 끊기므로 member_id 를 택함.

**신규 환경변수**
- `SYNC_FAILED_BACKOFF_HOURS=3` — failed 멤버 재선정 간격
- `RIOT_MATCH_ID_LOOKBACK=20` — 동기화마다 조회할 매치 ID 수
- `RIOT_MAX_NEW_MATCH_DETAILS=5` — 동기화 1회당 신규 매치 상세 상한

**알려진 한계**
- 부계정 실패는 `sync_logs` 상 success 로 남는다(`console.warn` 으로만 확인).
- 참가자 행을 못 만든 매치(myPart 없음)는 다음 동기화에서 재fetch 될 수 있다(회당 상한이 비용 제한).
- members/admin 경로는 존재 확인만 하고 puuid 는 저장하지 않는다(동기화가 해석).
- lookback 20 을 넘는 공백 구간 매치는 여전히 누락될 수 있다.

**검증 결과**
- `npx tsc --noEmit` ✅ 에러 0 / `npm run lint` ✅ 0 errors(기존 무관 warning 1건)
- 코드 리뷰 ✅ 부계정만 try/catch·대표 실패 throw 유지·`if (!primaryResult) throw` 유지·`CLEARED_RANK_COLUMNS` 펼침 유지(riot_puuid 덮어쓰기 없음)·or 필터 문자열·`toFetch` 상한·recent5 쿼리·any 없음·catch 패턴·`server-only`
- 런타임(읽기 전용) ✅ sync-all 선정 쿼리 실DB 실행 400 없음(8행, started_at asc 정렬 확인) / recent5 쿼리 4명 196~542ms, 저장값과 전원 일치 / 없는 member_id → 빈 결과 / Riot account-v1 없는 ID → 404(not_found 매핑 확인) / 비인증: riot-accounts POST·PATCH·me/member 401, sync-all GET 401(토큰 없음·오답), 관리자 POST 403 — 인증 전 Riot 호출 없음
- 미실행: 실제 동기화·계정 등록(운영 DB 쓰기 금지)

### 배치 B — 내전 화면 (#4~#6)

커밋: `fix: 내전 대기 순번·모달 에러·주최자 취소/상세 삭제 정비 — 대기 1번이 "대기 9번"으로 보였다`

**문제**
- #4 서버 `position` 은 확정+대기 전체 1-based 순번인데 목록 배지·목록/상세 토스트가 이를 그대로 "대기 N번"으로 표시 → 정원 8 꽉 찬 내전의 첫 대기자가 "대기 9번"으로 보였다(상세 배지만 클라에서 보정 중).
- #5 생성/수정 모달의 검증·서버 에러를 페이지 알림(`showMsg`)으로 띄워 모달 오버레이 뒤에 가려 보이지 않았다.
- #6 주최자에게 서버가 400으로 거절하는 '참가 취소' 버튼이 노출됐고, 상세 페이지에는 삭제 버튼이 없어 목록으로 돌아가야만 삭제할 수 있었다.

**변경 파일**
| 파일 | 내용 |
|---|---|
| `lib/customGames/waitlist.ts` | `participationPosition(index, confirmedCount)` 순수 헬퍼 → `{ position, confirmed, waitlist_position }`(확정이면 null). server-only 아님(클라 import 중) |
| `app/api/custom-games/route.ts` | 목록 GET `my_participation` 에 헬퍼 결과 + `is_host`(`host_member_id !== null` 명시 — null===null 함정 차단) |
| `app/api/custom-games/[id]/route.ts` | 상세 GET `my_participation` 에 헬퍼 결과 + `is_host` |
| `app/api/custom-games/[id]/join/route.ts` | POST 응답에 `waitlist_position`(미발견 null). 기존 필드 유지 |
| `app/custom-games/page.tsx` | 배지·토스트 `waitlist_position`, 주최자 취소 숨김, 생성 모달 인라인 에러(`createError`/`closeModal()`) |
| `app/custom-games/[id]/page.tsx` | 배지·토스트 `waitlist_position`, 주최자 취소 숨김, 헤더 삭제 버튼(+ `router.push('/custom-games')`), 수정 모달 인라인 에러(`editError`/`closeEdit()`) |
| `CLAUDE.md` | 내전 API 목록 아래 `my_participation` 필드 설명 + "대기 순번 표시는 `waitlist_position` 만" 규칙 |

**주요 결정**
- **파생만, 저장 없음:** `waitlist_position` 은 응답 시 `splitParticipants` + `effectiveMemberCapacity`(게스트 차감) 결과의 `confirmed.length` 기준으로 계산한다. status 컬럼·승격 로직 없음. `position` 은 하위호환으로 유지.
- **`is_host` 는 UX용:** 버튼 숨김일 뿐 서버 join DELETE 의 400 검사가 실제 방어선. 관리자(비주최자)는 `is_host=false` 라 취소 버튼이 계속 보인다.
- **헤더 래퍼:** `game && (!isClosed || canManage)` 로 넓히고 참가/취소/수정/라운드/종료 버튼에 각각 `!isClosed` 를 붙여 종료된 내전에서 기존 버튼이 재노출되지 않게 했다. 삭제만 종료된 내전에도 노출(목록과 동일한 confirm 문구).
- **삭제 성공 시 `deleting` 유지:** 이동 전 재클릭 방지. 실패 시에만 해제 + 페이지 에러. 종료 버튼 disabled 에도 `deleting` 추가.
- **모달 에러 초기화:** 열 때·제출 시작·모든 닫기 경로(배경/취소/성공)에서 null. 수정 성공 토스트는 기존대로 페이지 알림.

**알려진 한계**
- 상세 헤더 모바일 넘침은 `flex-wrap` 만 추가 — 레이아웃 재구성은 배치 D #13.
- 상세 배지는 구 응답 대비 `waitlist_position ?? position - confirmedList.length` 폴백을 남겼다(목록·토스트는 `?? '-'`).
- (기존) `GET /api/custom-games/not-a-uuid` 는 Postgres `22P02` 로 500 — 이번 변경 범위 밖.

**검증 결과**
- `npx tsc --noEmit` ✅ 에러 0 / `npm run lint` ✅ 0 errors(기존 무관 warning 1건) / `npm run build` ✅ (클라 번들 server-only import 없음)
- 헬퍼 단위 검증(node) ✅ 정원 8·확정 8 → index 8 = position 9·waitlist 1 / index 7 = 확정·null / 게스트 2 + 정원 8 → 7번째 멤버 waitlist 1 / index 10 → waitlist 3 / 게스트가 정원 초과(effective 0) → 첫 멤버 waitlist 1 / `splitParticipants` 9명 통합 → 9번째 waitlist 1
- 코드 리뷰 ✅ 검증 포인트 1~8 대조 — `is_host` null 함정(목록 명시 거부, 상세는 참가자 member_id 비교), 종료 내전 버튼 재노출 없음, 모달 에러 초기화 경로 전부, any 없음
- 런타임(읽기 전용, 비로그인) ✅ `/custom-games`·상세 → 307 `/login?next=...`(proxy 게이트 정상) / 목록 GET 200 `my_participation:null`·`can_manage:false` / 상세 GET 200 / 없는 UUID → 404
- 미실행: 내전 생성·참가·삭제 및 로그인 UI 수동 확인(운영 DB 쓰기 금지)
