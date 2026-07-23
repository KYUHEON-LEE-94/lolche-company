# Phase 4 (LoL 페이지) 구현 결과

기능은 전부 구현하되 `NEXT_PUBLIC_LOL_ENABLED`(기본 `false`)로 잠갔다.
Riot 프로덕션 키가 LoL 제품 미승인(403) 상태이므로 플래그가 꺼진 동안
네비게이션·대시보드 카드·`/lol` 라우트·동기화 단계가 모두 비활성이다.

## 변경 파일 목록

| 파일 경로 | 변경 내용 |
|---|---|
| `lib/constants/features.ts` | **신규.** `LOL_ENABLED = process.env.NEXT_PUBLIC_LOL_ENABLED === 'true'` (빌드타임 인라인) |
| `lib/constants/tierOrder.ts` | `rankOrder`/`tierOrder`/`RankLike`/`compareRank(a,b)` 추출 (기존 상수 그대로 유지) |
| `app/tft/MemberRanking.tsx` | 인라인 `rankOrder`/`tierOrder` 제거 → `compareRank` 사용. **정렬 결과 동일** |
| `lib/riot/api.ts` | `RIOT_LOL_LEAGUE_BASE_URL`, `LolLeagueEntry`, `LOL_SOLO_QUEUE`, `fetchLolLeaguesByPuuid()` 추가 |
| `lib/sync/doSyncMember.ts` | 플래그 on일 때만 LoL 랭크 조회 → `members.lol_*` 갱신. try/catch로 TFT 동기화 보호 |
| `app/lol/page.tsx` | `ComingSoon` → 실제 랭킹 구현 + `if (!LOL_ENABLED) notFound()` |
| `app/components/SiteNav.tsx` | 플래그 off면 "롤" 항목 미렌더 |
| `app/page.tsx` | 플래그 off면 롤 카드 미렌더 (on이면 `ready: true`) |
| `types/supabase.ts` | `Member`에 `lol_tier/lol_rank/lol_league_points/lol_wins/lol_losses/lol_synced_at` 추가 |
| `scripts/sql/20260724_lol_rank.sql` | **신규(미실행).** `members`에 `lol_*` 6컬럼 추가 |
| `.env.local` | 말미에 `NEXT_PUBLIC_LOL_ENABLED=false`, `RIOT_LOL_LEAGUE_BASE_URL` **추가만** (기존 값 무변경) |
| `CLAUDE.md` | 환경변수 2건 + "LoL 기능 플래그" 절 추가 |

## 주요 구현 사항

### 접근 차단 (4중)
1. `SiteNav` 링크 미렌더
2. 대시보드 카드 미렌더
3. `/lol` 진입 시 `notFound()` → **404** (URL 직접 접근 차단)
4. `doSyncMember`가 LoL 호출 자체를 스킵 (403 낭비 방지)

플래그를 `true`로 바꾸고 재빌드하면 4곳이 동시에 켜진다. **코드 수정 불필요.**
(`NEXT_PUBLIC_*`는 빌드타임 인라인이므로 값 변경 시 재빌드/재배포가 필요하다.)

### 403 degrade
`fetchLolLeaguesByPuuid()`는 403을 **재시도하지 않고** `console.warn`을 프로세스당 1회만 남긴다.
반환 규약을 계획보다 한 단계 구체화했다:
- `null` = 조회 불가(권한 미승인) → 호출부가 **DB 업데이트를 건너뛴다**
- `[]` = 조회 성공했으나 언랭 → `lol_*`를 null로 정상 갱신

빈 배열로만 degrade하면 403마다 기존에 쌓인 `lol_*` 값을 null로 밀어버리므로 분리했다.
그 외 상태코드는 기존 `riotFetch` 정책(429/5xx 재시도)을 그대로 탄다.
LoL 블록 전체가 try/catch로 감싸여 있어 실패해도 TFT 동기화·매치 수집은 계속된다.

### `compareRank` 공용화
기존 `MemberRanking.tsx`의 인라인 구현을 **동작 변경 없이** 그대로 옮겼다
(대문자 변환 없음, 미지값 999, 티어→랭크→LP 내림차순).
`app/hall-of-fame/page.tsx`는 `toUpperCase()`를 하는 다른 로직이라 손대지 않았다.
언랭 멤버는 `tier=null → 999`로 자동 최하단.

### `/lol` 페이지
Server Component, `revalidate = 60`, `.eq('status','approved')` 필수 필터 적용,
필요한 10개 컬럼만 select. `next/image`로 프로필 이미지(Storage public URL) 렌더.
랭커가 0명이면 "아직 동기화된 롤 랭크 정보가 없습니다" 안내.
Tailwind slate 다크 테마 + 티어 색상 맵을 `MemberRanking.tsx`와 맞췄다.
마스터~챌린저는 디비전 표기를 생략한다.

### DB 위치 결정
Analyst 계획은 `riot_accounts.lol_*`였으나 **Phase 2 미구현**이므로 `members`에 뒀다.
Phase 2에서 `tft_*`와 함께 대표 계정 캐시로 미러링될 예정이라는 사실을
SQL 파일 헤더 · `types/supabase.ts` · `doSyncMember.ts` 세 곳에 주석으로 남겼다.

## 검증 결과

| 검사 | 결과 |
|---|---|
| `npx tsc --noEmit` | ✅ 통과 (에러 0) |
| `npm run lint` | ✅ 통과 (에러 0, 경고 9건 — 전부 이번 변경과 무관한 기존 경고) |
| `npm run build` | ✅ 통과 |
| `any` 사용 | 0건 |

### `/lol` 404 확인 — ⚠ 읽는 방법 주의

미들웨어가 **모든 비공개 경로에 로그인 게이트**를 건다. 따라서 비로그인 curl은
플래그와 무관하게 307이 먼저 걸리고, 이는 **정상 동작**이다:

```
$ curl -sI localhost:3000/lol
HTTP/1.1 307 Temporary Redirect
location: /login?next=%2Flol
```

`/`, `/tft`, `/steam`, `/hall-of-fame`도 모두 동일하게 307 → 기존 페이지 회귀 없음.
**로그인 상태에서 404여야 한다**는 요구는 빌드 산출물의 프리렌더 상태코드로 검증했다
(미들웨어를 통과한 뒤 라우트가 실제로 무엇을 반환하는지):

| 조건 | `.next/server/app/lol.meta` | `lol.html` |
|---|---|---|
| `NEXT_PUBLIC_LOL_ENABLED=false` (기본) | `"status": 404` | "This page could not be found" |
| `NEXT_PUBLIC_LOL_ENABLED=true` | status 필드 없음(=200) | "아직 동기화된 롤 랭크 정보가 없습니다" |

즉 로그인한 사용자가 `/lol`에 직접 들어오면 404를 받는다.
검증 후 기본 플래그(false)로 재빌드해 `.next`를 원상 복구해 두었다.

플래그 on 빌드에서 페이지가 안내 문구를 렌더한 것은 SQL 미실행으로 `lol_*` 컬럼이
아직 없어 select가 실패했기 때문이며, 500이 아니라 안내로 degrade하는 것이
계획의 QA 항목("LoL 403 시 500이 아니라 안내로 degrade")과 일치한다.

## 미구현 / 후속 조치

1. **`scripts/sql/20260724_lol_rank.sql` 미실행** (지시대로 파일만 생성).
   Supabase SQL Editor에서 실행해야 `lol_*` 저장/조회가 동작한다. **SQL 먼저 → 배포 나중.**
2. **Vercel 환경변수 등록 필요**: `NEXT_PUBLIC_LOL_ENABLED`, `RIOT_LOL_LEAGUE_BASE_URL`.
3. **자유랭크(`RANKED_FLEX_SR`) 미구현** — 지시대로 솔로랭크만 다룬다.
4. **`/lol` 동기화 버튼 없음** — 기존 `/api/members/[id]/sync` 경로를 그대로 타면 LoL도 함께 갱신된다.

## ⚠ 발견 사항 (수정하지 않음)

`.env.local` 8번째 줄의 키 이름이 깨져 있다:

```
RIOT_ACCOUNT_BASE_UR지금L=https://asia.api.riotgames.com/riot/account/v1/accounts/by-riot-id
```

정상 이름은 `RIOT_ACCOUNT_BASE_URL`이다. 현재 상태로는 `fetchPuuid()`가
"Riot API 환경 변수가 설정되지 않았습니다"(500)로 실패한다 — 즉 **puuid 미보유 멤버의
로컬 동기화가 이미 깨져 있다.** "`.env.local`의 다른 값은 절대 건드리지 말 것" 지시에 따라
수정하지 않았으니, 사용자 확인 후 키 이름을 바로잡아야 한다. (Phase 4와는 무관한 기존 문제)
