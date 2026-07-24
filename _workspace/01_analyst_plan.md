# 분석 결과 — `/admin/members/sync` 전면 재설계 + 기능 추가

## 작업 요약
동기화 페이지를 (1) 디자인 토큰/`control` 페이지 패턴에 정합, (2) hover·줄무늬를 CSS로 이전, (3) anon `supabaseClient` 직접조회를 관리자 서버 라우트로 교체, (4) 검색/필터/정렬/상단 요약/미연결 하이라이트/실패사유 기능을 선별 추가. **서버 변경 1건**(`/api/admin/members`에 티어+sync상태 필드 추가) 필요, 나머지는 클라이언트로 가능.

## 1. 현재 API 계약 (유지할 것)
### `POST /api/members/[id]/sync`
- 인증: 세션 필수, 본인 아니면 requireAdmin
- 쿨다운 중: `{ ok:true, skipped:true, reason:'cooldown', nextAllowedInSec, last_synced_at }` (HTTP 200)
- 성공: `{ ok:true, skipped:false, nextAllowedInSec:300 }` / 실패: `{ ok:false, error }`
- **현재 `handleSync`가 이 계약을 정확히 지킴 — 재설계 시 로직 유지**

### `POST /api/admin/sync-all`
- requireAdmin. 커서 기반 배치: 요청 `{ cursorId, limit? }` → 응답 `{ batch:{limit,cursorId,nextCursorId,done}, processed, results[] }`
- 대상은 **stale(1h+) 또는 stuck(30분+)만**. "전체"가 아니라 "갱신 필요분". **방금 동기화한 멤버 제외는 정상** → UI 문구가 "처리 0명"을 오해시키지 않게 "갱신 필요 멤버 N명 동기화"
- `results[]`에 멤버별 `{memberId, memberName, ok, status, error, durationMs}` → 요약 토스트에 사용

## 2. members 행에 이미 있는데 안 쓰는 컬럼
- `status`(pending|approved|rejected), `user_id`, `discord_id`
- `sync_status`(running|success|failed|null), `last_sync_error`, `last_sync_finished_at`, `sync_attempts`
- `tft_tier_prev/tft_rank_prev/tft_lp_prev` (델타)
→ **동기화 실패·진행중은 sync_logs 없이 members 행만으로 표현 가능**

## 3. 디자인 정합 (control 페이지 관용구 차용)
- 카드: `bg-white/[0.02] border border-white/[0.05] hover:border-white/10 rounded-2xl`
- 상태 뱃지: `bg-{color}-500/10 text-{color}-300 border-{color}-500/30`
- 로그인 뱃지: 연결=sky-500, 미연결=slate-700/30
- 대표계정=indigo-500/10, 부계정=slate-700/20

## 4. 토큰 매핑 (기존 것만, 새 토큰 금지)
| 하드코딩 | 교체 |
|---|---|
| `rgba(255,255,255,0.07)` 보더 | `border-line` |
| `rgba(255,255,255,0.03)` 배경 | `bg-surface` |
| sticky 배경 `rgb(13,17,23)` | `bg-canvas`/`bg-surface` |
| 인디고 버튼 인라인 | `BTN_GHOST` |
| 에러/성공 배너 | `ALERT.error`/`ALERT.ok`/`ALERT.warn`(쿨다운) |
| hover `rgba(99,102,241,0.07)` | CSS `hover:bg-surface-2` (JS 상태 제거) |
- 헤더는 `H1`(text-3xl) 대신 **control식 text-2xl 유지**(정합)
- 티어 색 10종은 도메인 색이라 로컬 상수 유지(새 토큰 불필요)

## 5. 모바일 — 데스크톱 우선 + md 미만 카드
- `md 이상`: 테이블, 동기화 컬럼 CSS `sticky right-0` + 배경은 토큰
- `md 미만`: control식 카드 리스트 (가로 스크롤 제거)
- `hoveredId` JS 상태·`STICKY_BASE` 인라인 계산 **전부 삭제** → CSS `hover:`/`even:`/`odd:`

## 6. sync_logs — 보류
- anon SELECT 정책 없음 → 브라우저 직접 조회 불가
- 일반 상태는 members 행으로 충분. 시계열은 신규 라우트 비용 대비 부가가치 낮음 → 팝오버 최근5건 정도로만(선택)

## 7. 접근성
- 배너에 `role="status"`/`role="alert"` + `aria-live`, 동기화 버튼 `aria-busy`
- 쿨다운은 에러(빨강) 아니라 `ALERT.warn`(경고톤)이 의미상 정확

## 추가 기능 우선순위
### 있음(구현)
1. **상단 요약 바** — 총원/승인·대기·거절/미연결/실패 수/마지막 전체동기화. 클라 집계. 가치 최상
2. **검색** — 이름·Riot ID (includes)
3. **필터** — 상태/로그인 연결여부/실패만
4. **정렬** — 티어순/최근동기화순/이름순
5. **로그인 미연결 하이라이트** — 다수 미연결 상태 대응
6. **동기화 실패 표시** — `sync_status='failed'` + `last_sync_error` 뱃지/툴팁
### 보류
7. 다중계정 티어 — 대표계정만 기본, "+N계정" 표시, 상세는 팝오버(1차 제외)
8. sync_logs 감사 이력 — 팝오버 최근5건만 선택
### 제외
- sync-all 결과 상세 모달 — 요약 토스트로 충분(과설계)

## 필요한 서버 변경 — 1건
**안 A(권장): `/api/admin/members`(GET) 확장.** 응답 멤버 객체에 `tft_tier, tft_rank, tft_league_points, tft_doubleup_*, sync_status, last_sync_error, last_sync_finished_at` 추가. sync 페이지는 anon 조회를 이 라우트 fetch로 교체. control은 새 필드 무시 → 파괴적 변경 아님.
- `last_sync_error` 원문은 requireAdmin 라우트라 관리자 한정 → 안전
- `.eq('status',...)` 필터 **미적용** (관리자는 pending 포함 전원 봐야 함)
- 요약은 목록 받아 클라 `reduce` (수백 이내라 충분)

## 영향 파일
| 파일 | 변경 |
|---|---|
| `app/admin/members/sync/page.tsx` | 전면 재작성 |
| `app/api/admin/members/route.ts` | 티어·sync상태 필드 추가 |
| (선택) `app/admin/_components/StatusBadge/LoginBadge` | 중복 승격, 과하면 생략 |

## 위험 요소
- `handleSync`(skipped/cooldown 분기)·`handleSyncAll`(커서 while-루프) 계약 유지
- sync-all "stale만" → "처리 0명" 정상, 문구 오해 방지
- `/api/admin/members` 확장 시 control 무회귀 확인
- anon 제거로 미인증 시 일관 차단(개선)
- `any` 금지, catch 패턴, requireAdmin 필수. 클라에서 supabaseAdmin/Service import 금지
- 티어 정렬 가중치 매핑 도메인 로직 — 저위험이나 확인

## QA 검증
1. 개별: 성공/쿨다운(warn)/에러(error) 3분기, aria-busy, 완료 후 갱신
2. 전체: 커서 끝까지, 429 중단, "처리 N명" (0명 문구 자연스러움)
3. 목록이 admin 라우트 로드, 미인증 시 리다이렉트 유지
4. 필터/검색/정렬 조합, pending 보임
5. 미연결·실패 하이라이트가 데이터와 일치
6. 데스크톱 sticky 동기화 컬럼 배경이 hover/줄무늬에 안 튐(CSS만)
7. md 미만 카드 가로 스크롤 없음
8. control 무회귀
9. 네트워크 탭에 anon members 직접 쿼리 없음

## Phase
- P1(서버): `/api/admin/members` 필드 추가 + control 무회귀
- P2(UI 뼈대): anon→admin fetch, 토큰화, JS hover/sticky 제거, 데스크톱 테이블+모바일 카드
- P3(기능): 요약 바 → 검색/필터/정렬 → 미연결·실패 하이라이트
- P4(접근성): aria-live, warn 톤, aria-busy
