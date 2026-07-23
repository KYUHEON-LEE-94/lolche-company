# Phase 4 — 스팀 "지금 게임 중" 구현 결과

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|-----------|---------|
| `lib/steam/api.ts` | `SteamPlayerSummary`에 `personastate` / `gameextrainfo` / `gameid` 추가 + 파서 반영 (수정) |
| `lib/steam/presence.ts` | **신설.** `import 'server-only'`, 모듈 스코프 TTL 캐시, `fetchPresenceMap()` / `isPresenceVisible()` |
| `app/api/steam-presence/route.ts` | **신설.** `force-dynamic`, 로그인 + `approved` 게이트, GetPlayerSummaries 배치 1회 |
| `app/steam/SteamPresence.tsx` | **신설.** `'use client'`, `visibilitychange` 연동 60초 폴링, 온라인 점 + 게임명 배지 |
| `app/steam/page.tsx` | **아일랜드 1줄 삽입 + import 1줄만.** `revalidate=300`·DB-only 로직 무변경 |
| `.env.local` | `STEAM_PRESENCE_TTL_MS=60000` **추가만** (기존 값 무변경) |
| `CLAUDE.md` | 디렉토리 트리 3곳, 환경변수 절, `/steam` 섹션(3-상태 표), 외부 호출 경계 규칙, 변경 이력 |

DB 마이그레이션 없음. DB 쓰기 없음.

## 주요 구현 내용

### 경계 분리 (지시 사항 2)
`app/api/steam/**`(DB 전용 경계)를 건드리지 않고 **`app/api/steam-presence/route.ts`** 로 분리했다.
`app/api/steam/` 하위에 `lib/steam/*` import 가 0건임을 grep 으로 확인했다(주석 언급만 존재).
CLAUDE.md의 "스팀 API 경로 규칙(2계층)" 항목에 `steam-presence` 를 외부 호출 경계로 명시했다.

### `/steam` 페이지 불변 (지시 사항 1)
`page.tsx` 변경은 `import SteamPresence` 1줄 + `<SteamPresence />` 1줄이 전부다.
`revalidate = 300`, `loadSteamData()`, 세션 미접근 원칙 모두 무변경.
빌드 결과에서 `/steam` 은 여전히 `○ (Static) / 5m` 이고 `/api/steam-presence` 만 `ƒ (Dynamic)` 이다.

> 여백 처리: 섹션이 숨겨질 수 있어 `mb-12` 를 페이지의 래퍼 div 가 아니라 컴포넌트 내부 `<section>` 이
> 갖도록 했다. 래퍼 div 로 감쌌다면 비로그인 사용자에게 빈 96px 여백이 남는다.

### 캐시
`lib/steam/presence.ts` 모듈 스코프 단일 엔트리 `{ at, map }`. TTL = `STEAM_PRESENCE_TTL_MS`(기본 60000).
`storeSearch.ts` 의 `Number(process.env.X ?? 기본값)` 방식을 그대로 따랐다.

계획 대비 **추가한 2가지** (둘 다 캐시 정확도 보강, 범위 확대 아님):
1. **in-flight 프라미스 공유** — 동시 요청 N건이 캐시 미스에 동시 진입하면 Steam 을 N회 호출한다.
   진행 중 프라미스를 재사용해 "TTL 당 1회" 를 실제로 보장한다.
   (QA 항목 "두 브라우저 동시 로드 → Steam 호출 1회" 가 이것 없이는 실패할 수 있다)
2. **캐시 커버리지 검사** — 요청 id 중 캐시에 없는 것이 있으면 TTL 이 남아도 갱신한다.
   신규 스팀 연결 멤버가 최대 60초간 목록에서 누락되는 것을 막는다.
   Steam 응답에 없는 id 도 오프라인 엔트리로 채워 넣어 매 요청 무효화되는 것을 방지했다.

### 정확도 — 3-상태 분리
`personastate` 는 프로필 비공개면 항상 0 이므로 "오프라인" 단정이 거짓이 된다.

| 조건 | state | UI |
|---|---|---|
| DB `steam_visibility ≠ 3` **또는** 응답 `communityvisibilitystate ≠ 3` | `unavailable` | "표시 불가 — 프로필 비공개" 안내 줄 |
| `personastate` 1~6 | `online` | 초록 점 + 라벨(온라인/바쁨/자리비움/취침/거래 희망/플레이 희망) |
| `personastate` 0 | `offline` | 미표시 |

`gameextrainfo` 가 있으면 라벨 대신 게임명을 쓰고 "게임 중" 배지를 붙인다.
`unavailable` 멤버에게는 `persona_state` / `game_name` 을 **null 로 마스킹**해서 내보낸다
(비공개 프로필의 0 을 클라이언트가 오프라인으로 재해석할 여지를 없앤다).

### 보안
- 인증: `getMyMember()` → 401(미로그인) / 403(멤버 없음·미승인). 대상 목록도 `approved` + `steam_id64 not null`
- `server-only` 체인 유지: `presence.ts` → `api.ts` 둘 다 `import 'server-only'`
- catch 에서 `e instanceof Error ? e.message : '오류 발생'` 사용, URL 미기재 (Steam 실패 시 503)

## 검증 결과

| 항목 | 결과 |
|---|---|
| `npx tsc --noEmit` | 통과 (0 에러) |
| `npm run lint` | 0 에러 / 5 warning — **전부 기존 `app/profile/ProfileEditor.tsx`** 의 것. 신규 파일 지적 0 |
| `npm run build` | 통과. `/steam` = `○ 5m`, `/api/steam-presence` = `ƒ` |
| `/api/steam-presence` 비로그인 | **401** `{"ok":false,"message":"로그인이 필요합니다."}` (dev 서버 실측) |
| `.next/static` 에 `STEAM_API_KEY` 값 grep | **0건** (키 문자열·변수명 모두 0) |
| `/steam` 이 Steam API 미호출 | `app/steam/**`·`app/api/steam/**` 에 `lib/steam/*` import 0건 확인 |
| GetPlayerSummaries 응답 필드 | 실호출로 `personastate`/`communityvisibilitystate` 존재 확인. 게임 미실행 시 `gameextrainfo`/`gameid` **키 자체가 없음** → `asString()` 이 `null` 로 정규화하므로 안전 |

`npm run build` 첫 시도가 `ENOTEMPTY: rmdir .next/server` 로 실패했다. 코드와 무관한
스테일 빌드 산출물 문제이며 `rm -rf .next` 후 정상 통과했다.

## 데이터 한계 (보고 요청 항목)

**스팀 연결 멤버가 현재 1명뿐이다** — `approved` + `steam_id64 not null` 조회 결과 `마이즈즈 94`
(`steam_visibility = 3`, 공개) 1행. 따라서 아래는 실데이터로 검증되지 않았다:

- 복수 멤버 정렬·그리드 2열 레이아웃
- `unavailable`(비공개 프로필) 안내 줄 — 현재 공개 멤버 1명뿐이라 **한 번도 렌더되지 않는다**
- 100개 초과 배치 분할 (`fetchPlayerSummaries` 의 기존 chunk 로직, 이번에 미변경)
- 실제 "게임 중" 배지 — 조회 시점에 아무도 게임 중이 아니었다

QA 는 위 4개를 코드 리뷰 또는 시드 데이터로 확인해야 한다.

## 미구현 항목

없음. Phase 4 지시 6개 항목 전부 구현했다.
P5(레이아웃)는 지시대로 손대지 않았다 — `SiteNav.tsx`, `app/page.tsx`, `lib/ui/styles.ts` 무변경.
