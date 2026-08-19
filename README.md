# 🐧 롤체 컴퍼니 (lolche-company)

> 카카오톡 단톡방 멤버 전용 TFT / 리그 오브 레전드 랭킹·내전 관리 서비스.
> Riot Games API로 랭크를 동기화하고, 스팀 연동·내전 모집·명예의 전당까지 한곳에서.

**비상업적**이며 **디스코드 서버 멤버만 접근 가능한 비공개 서비스**입니다.

---

## 🚀 주요 기능

### 랭킹
- **롤체(TFT)** 솔로·더블업 랭크 랭킹 보드 (티어·LP·승률, 매일 자동 동기화)
- **롤(협곡)** 솔로 랭크 랭킹 (TFT와 별개의 Riot 앱 키 사용)
- 대시보드 홈: **롤체 TOP 5 · 최근 랭크 변동 · 최근 매치** 요약
- 멤버를 클릭하면 **상세 전적 패널**(랭크 변동 그래프 · 등수 분포 · 최근 매치 · 계정 탭)
- 승인된 멤버는 누구나 개별 랭크 동기화 가능(멤버 단위 쿨다운으로 레이트리밋 보호)

### 계정 · 인증
- **디스코드 OAuth 전용 로그인** (`NEXT_PUBLIC_DISCORD_GUILD_ID` 설정 시 특정 서버 멤버만 허용)
- **라이엇 계정 최대 3개** 등록 + **대표 계정** 지정 (공개 랭킹엔 대표만 노출)
- 멤버 자가 등록 → 관리자 승인 워크플로
- 프로필 아바타는 **디스코드 프로필** 자동 연동, 프로필 프레임 선택

### 내전 (custom games)
- 종류: **롤체 · 롤 · 스팀 · 기타**, 일정·정원 지정 후 참가 신청
- 대기열은 저장하지 않고 **신청 순번에서 파생** (승격 경합 없음)
- **롤체 내전**: 팀 배정(개인전/2인 팀전) + 라운드별 결과 자동 수집
- **롤 내전**: 증바람(칼바람)·협곡 선택, **드래그앤드롭 5:5 팀 배정**
  (협곡은 탑/정글/미드/원딜/서폿 포지션 슬롯, 카드에 롤 티어 표시, 외부인 카드 지원)
- **스팀 내전**: 멤버 보유 게임 + 스팀 전체 카탈로그에서 게임 선택
- 관리자·주최자는 승인 멤버를 직접 명단에 추가 가능

### 스팀
- 스팀 ID 등록 → **"나와 같은 게임을 가진 사람들"**, 함께 할 수 있는 멀티플레이 게임
- **"지금 스팀 접속 중"** 실시간 표시

### 디스코드 알림
- **내전 생성 시** 디스코드 채널에 임베드 알림(제목·종류·정원·일정·주최·링크)
- **시작 임박(기본 30분 전)** 자동 알림 — 내전당 1회만 발송
- 웹훅 방식이라 봇 불필요. URL 은 `DISCORD_WEBHOOK_URL` 환경변수로만 관리(서버 전용)

### Discord 활동
- TFT 페이지에서 승인 멤버의 최근 30일 음성 시간·활동일·메시지 수 확인
- DB에 연결된 Discord 계정만 활동 봇 데이터와 서버에서 매칭하며 Discord ID는 브라우저에 노출하지 않음
- Railway 활동 API 장애 시 활동 보기만 조회 불가로 전환되고 기존 TFT 랭킹은 정상 유지

### 명예의 전당
- 시즌 마감 시점 랭크 스냅샷, 공동 순위, 추방 후에도 이름 보존

### 기타
- 🌗 **라이트 / 다크 테마 전환** (기기 설정 자동 감지 + 수동 토글)
- 관리자: 멤버 CRUD·승인·추방, 동기화 현황, 시즌 관리, 프레임 관리

---

## 🛠 기술 스택

| 영역 | 스택 |
|---|---|
| 프레임워크 | **Next.js 16** (App Router) + **React 19** + TypeScript 5 |
| 스타일 | Tailwind CSS v4 + Framer Motion + @dnd-kit |
| 데이터베이스 | Supabase (PostgreSQL) |
| 인증 | Supabase Auth — Discord OAuth |
| 외부 API | Riot Games API (TFT·LoL), Steam Web API, Discord Webhook |
| 배포 | Vercel + GitHub Actions (아래 "자동화" 참조) |

---

## 📁 동작 흐름

1. 디스코드로 로그인 → 프로필에서 라이엇 계정 등록 (최대 3개, 대표 지정)
2. 관리자 승인 → 대표 계정 랭크가 공개 랭킹에 노출
3. 서버가 Riot API로 PUUID·랭크·매치를 수집해 Supabase에 저장
   - TFT 키 / LoL 키는 **서로 다른 앱**이라 PUUID도 각각 발급·보관
4. 웹 UI에서 랭킹·전적·내전·스팀 정보를 시각화
5. 자동화(아래)가 정기적으로 전체 동기화 (429/5xx·520 자동 재시도 백오프)

---

## ⏱ 자동화 (스케줄)

Vercel Hobby 는 크론 빈도(하루 1회)·함수 시간에 제약이 있어, 잦은 주기 작업은
**GitHub Actions 가 서버 엔드포인트를 주기적으로 호출**하는 방식으로 처리한다
(`.github/workflows/`, `Authorization: Bearer CRON_SECRET` 인증).

| 작업 | 주기 | 방식 |
|---|---|---|
| **전체 랭크 동기화** | 매시간 | GitHub Actions 가 `sync-all` 을 커서 따라 반복 호출해 승인 멤버 전원 갱신(stale 1시간+만) |
| **내전 시작 임박 알림** | 10분마다 | GitHub Actions → `notify-reminders` (30분 전 1회 발송) |
| 스팀 캐시 동기화 | 매일 11:00 | Vercel Cron |

> GitHub 저장소 Secrets 에 `SITE_URL`·`CRON_SECRET`, Vercel 환경변수에
> `CRON_SECRET`·`DISCORD_WEBHOOK_URL` 등록 필요.

Discord 활동 보기를 사용하려면 Vercel에 아래 서버 환경변수를 추가한 뒤 재배포합니다. API 키 실제 값은 저장소에 기록하지 않습니다.

```text
DISCORD_ACTIVITY_API_KEY=
DISCORD_ACTIVITY_GUILD_ID=1535594309217419304
DISCORD_ACTIVITY_API_BASE_URL=https://tactician-discord-bot.up.railway.app
```

---

## 🔧 개발

```bash
npm run dev       # 개발 서버 (localhost:3000)
npm run build     # 프로덕션 빌드
npm run lint      # ESLint
npx tsc --noEmit  # 타입 검사
```

- 환경 변수·디렉토리 구조·설계 규칙 등 상세 문서는 [`CLAUDE.md`](./CLAUDE.md) 참조
- DB 마이그레이션은 `scripts/sql/`에 파일로 작성하고 Supabase SQL Editor에서 직접 실행 (**SQL 먼저 → 배포 나중**)

---

## 🔒 서비스 안내
- Riot·Steam API Key와 Supabase service role 키는 **서버 사이드에서만** 사용되며 클라이언트에 노출되지 않습니다.
- 상업적 목적 없이 커뮤니티 내부용으로만 운영합니다.
