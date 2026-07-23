# Phase B1 — 내전 권한 하드닝 구현 결과

## 전수 조사 결과 (`app/api/custom-games/**`)

라우트 파일 7개, export된 핸들러 11개. 계획서에 없던 쓰기 엔드포인트는 **없었다**.

| 엔드포인트 | 메서드 | 종류 | B1 처리 |
|---|---|---|---|
| `/api/custom-games` | GET | 읽기 | 무변경 |
| `/api/custom-games` | POST | 쓰기(생성) | **무변경 — 예외** (비관리자 생성 허용 요구사항) |
| `/api/custom-games/[id]` | GET | 읽기 | 무변경 |
| `/api/custom-games/[id]` | DELETE | 쓰기 | `requireGameManager()` |
| `/api/custom-games/[id]/end` | POST | 쓰기 | `requireGameManager()` |
| `/api/custom-games/[id]/rounds` | POST | 쓰기 | `requireGameManager()` |
| `/api/custom-games/[id]/teams` | GET | 읽기 | 무변경 |
| `/api/custom-games/[id]/teams` | POST | 쓰기 | `requireGameManager()` |
| `/api/custom-games/[id]/guests` | GET | 읽기 | 무변경 |
| `/api/custom-games/[id]/guests` | POST | 쓰기 | `requireGameManager()` |
| `/api/custom-games/[id]/guests/[guestId]` | DELETE | 쓰기 | `requireGameManager()` |

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|-----------|---------|
| `lib/customGames/authorize.ts` | **신규** — `requireGameManager()` 가드 |
| `app/api/custom-games/[id]/route.ts` | DELETE에 가드 적용, import 교체 |
| `app/api/custom-games/[id]/end/route.ts` | POST에 가드 적용, import 교체 |
| `app/api/custom-games/[id]/rounds/route.ts` | POST에 가드 적용, import 교체 |
| `app/api/custom-games/[id]/teams/route.ts` | POST에 가드 적용, import 교체 |
| `app/api/custom-games/[id]/guests/route.ts` | POST에 가드 적용, import 교체 |
| `app/api/custom-games/[id]/guests/[guestId]/route.ts` | DELETE에 가드 적용, import 교체 |
| `app/api/custom-games/route.ts` | **변경 없음** (생성 예외) |

## 주요 변경 사항

### 1. 공통 가드 `lib/customGames/authorize.ts`

동일한 6줄이 6곳에 복제되는 것을 피하기 위해 헬퍼로 추출했다.
파일명은 Analyst 계획의 B2 예정 파일(`lib/customGames/authorize.ts`)과 일치시켜,
B2에서 `canManageGame()`을 같은 파일에 추가하고 `requireGameManager()`를 교체하면 되도록 했다.

```ts
export async function requireGameManager(): Promise<NextResponse | null> {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })

  const { ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: '권한이 없습니다' }, { status: 403 })

  return null
}
```

**401/403 분리가 필요한 이유:** `requireAdmin()`은 비로그인과 비관리자를 모두 `{ ok: false }`
하나로 반환하므로 그것만으로는 두 케이스를 구분할 수 없다. 그래서 `getCurrentUser()`를 먼저 호출해
비로그인을 401로 걸러낸 뒤 `requireAdmin()`으로 403을 판정한다.

**JSON 고정:** 미들웨어가 `/api/*`를 통과시키므로 라우트가 직접 `NextResponse.json()`으로 응답한다.
리다이렉트는 발생하지 않는다.

### 2. 응답 형식 일관성

`app/api/custom-games/**` 기존 라우트는 전부 `{ error: string }` 형식을 사용한다
(`{ ok: false, message }`를 쓰는 파일은 이 디렉토리에 없음). 가드도 `{ error }`로 통일했고,
기존 401 메시지 문구(`'로그인이 필요합니다'`)를 그대로 유지해 프론트 회귀가 없다.

### 3. 설계 의도 주석

각 라우트 핸들러 첫 줄에 남겼다:

```ts
// B1: 임시로 관리자 전용. B2에서 canManageGame(주최자 본인 + 관리자)으로 완화된다.
```

헬퍼(`authorize.ts`)에도 "최종 형태가 아니며 B2에서 `host_member_id` 기반으로 완화된다"는
설명과 401/403·JSON 응답 이유를 JSDoc으로 기록했다.

### 4. 예외 보존 — `POST /api/custom-games`

**의도적으로 무변경.** grep으로 확인: 해당 파일 내 `requireAdmin|requireGameManager` 출현 **0건**.
기존 `getCurrentUser()` 로그인 확인만 유지된다.

## 검증 결과

### 정적 검사

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 (에러 0) |
| `npm run lint` | ✅ 통과 (에러 0, 경고 9건 — 전부 기존 파일의 사전 존재 경고. custom-games/authorize 관련 경고 0) |
| `npm run build` | ✅ 통과. 7개 custom-games 라우트 모두 정상 빌드 |
| `any` 사용 | 0건 |

### 런타임 검사 (dev 서버 :3000, 비로그인 curl)

| 요청 | 상태 | Content-Type | 본문 |
|---|---|---|---|
| `DELETE /api/custom-games/{id}` | **401** | application/json | `{"error":"로그인이 필요합니다"}` |
| `POST /api/custom-games/{id}/end` | **401** | application/json | `{"error":"로그인이 필요합니다"}` |
| `POST /api/custom-games/{id}/rounds` | **401** | application/json | `{"error":"로그인이 필요합니다"}` |
| `POST /api/custom-games/{id}/teams` | **401** | application/json | `{"error":"로그인이 필요합니다"}` |
| `POST /api/custom-games/{id}/guests` | **401** | application/json | `{"error":"로그인이 필요합니다"}` |
| `DELETE /api/custom-games/{id}/guests/{gid}` | **401** | application/json | `{"error":"로그인이 필요합니다"}` |
| `POST /api/custom-games` (예외) | **401** | application/json | `{"error":"로그인이 필요합니다"}` |
| `GET /api/custom-games` (회귀) | **200** | application/json | `{"games":[]}` |

전부 JSON. HTML 리다이렉트 응답 0건.

### 미검증 항목 (QA 인계)

- **비관리자 로그인 세션의 403 응답**은 curl로 세션을 만들 수 없어(Discord OAuth 전용) 런타임 검증하지 못했다.
  코드 경로상 `requireAdmin()`이 `{ ok: false }`를 반환 → `403 {"error":"권한이 없습니다"}`가 보장된다.
  QA가 브라우저에서 비관리자 계정으로 로그인해 확인 필요:
  - 6개 쓰기 엔드포인트 → 403
  - `POST /api/custom-games` → 200 (요구사항 회귀 방지)

## 미구현 항목

없음. B1 범위 전체 구현 완료. B2/B3/A는 계획대로 손대지 않았다.
`types/supabase.ts`, SQL, UI 파일은 일절 변경하지 않았다.
