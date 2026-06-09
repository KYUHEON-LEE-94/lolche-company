---
name: lolche-dev
description: "lolche-company 프로젝트의 기능 구현, 버그 수정, 리팩토링, 보안 개선 등 모든 코드 변경 작업을 Analyst→Developer→QA 파이프라인으로 처리하는 오케스트레이터. '기능 추가', '버그 수정', '수정해줘', '개선해줘', '보안', '최적화', '리팩토링', 'API 변경', 'DB 쿼리', '컴포넌트 수정' 등 코드 변경이 필요한 요청이면 반드시 이 스킬을 사용할 것. 단순 코드 설명이나 질문에는 사용하지 않는다."
---

# lolche-dev 오케스트레이터

lolche-company 코드베이스의 모든 코드 변경 작업을 **Analyst → Developer → QA** 파이프라인으로 처리한다.

**실행 모드:** 에이전트 팀 (Agent tool, 순차 파이프라인)

## Phase 0: 컨텍스트 확인

시작 시 `_workspace/` 디렉토리 존재 여부를 확인하여 실행 모드를 결정한다.

```bash
ls _workspace/ 2>/dev/null
```

- **`_workspace/` 없음** → 초기 실행: Phase 1부터 전체 실행
- **`_workspace/` 있음 + 사용자가 부분 수정 요청** → 부분 재실행: 해당 에이전트만 호출
- **`_workspace/` 있음 + 새 요청** → 새 실행: `_workspace/`를 `_workspace_prev/`로 이동 후 Phase 1 실행

## Phase 1: Analyst 실행

Analyst 에이전트를 호출한다. Analyst는 코드베이스를 탐색하고 구현 계획을 수립하여 `_workspace/01_analyst_plan.md`에 저장한다.

**Agent 호출 파라미터:**
- `subagent_type`: `Explore`
- `model`: `opus`
- `prompt`: 아래 형식으로 작성

```
작업 유형: [분석 | 기능 구현 | 버그 수정 | 리팩토링]
요청 내용: {사용자 원문 요청}
범위 힌트: {관련 파일/기능 영역 — 없으면 생략}

에이전트 정의: .claude/agents/analyst.md를 읽고 역할에 따라 작업을 수행하라.
작업 디렉토리: {프로젝트 절대경로}
```

Analyst 완료 후 `_workspace/01_analyst_plan.md`를 읽어 구현 계획을 확인한다.

## Phase 2: Developer 실행

Developer 에이전트를 호출한다. Developer는 Analyst 계획을 기반으로 코드를 구현하고 `_workspace/02_developer_report.md`에 결과를 저장한다.

**Agent 호출 파라미터:**
- `subagent_type`: `general-purpose`
- `model`: `opus`
- `prompt`: 아래 형식으로 작성

```
에이전트 정의: .claude/agents/developer.md를 읽고 역할에 따라 작업을 수행하라.
작업 디렉토리: {프로젝트 절대경로}

Analyst 계획: _workspace/01_analyst_plan.md를 읽어 구현 계획을 확인하라.

CLAUDE.md의 코드 규칙을 엄수하라:
- any 타입 사용 금지, catch 블록: catch (e) + e instanceof Error ? e.message : '오류 발생'
- 데이터 변경 Server Action 첫 줄에 requireAdmin() 호출 필수
- Supabase: 필요한 컬럼만 select, 관계 조인은 !inner
- 관리자 API 입력 검증: member_name 50자, riot_game_name 30자, riot_tagline 10자
- Riot API 키: X-Riot-Token 헤더, URL 쿼리 파라미터 금지
```

Developer 완료 후 `_workspace/02_developer_report.md`를 읽어 구현 결과를 확인한다.

## Phase 3: QA 실행

QA 에이전트를 호출한다. QA는 구현 결과를 검증하고 문제가 없으면 커밋 및 푸시를 수행한다.

**Agent 호출 파라미터:**
- `subagent_type`: `general-purpose`
- `model`: `opus`
- `prompt`: 아래 형식으로 작성

```
에이전트 정의: .claude/agents/qa.md를 읽고 역할에 따라 작업을 수행하라.
작업 디렉토리: {프로젝트 절대경로}

검증 대상:
- _workspace/01_analyst_plan.md (검증 포인트 참조)
- _workspace/02_developer_report.md (변경 파일 목록 및 주요 변경 사항)

검증 순서:
1. npx tsc --noEmit — 타입 에러 0개 확인
2. npm run lint — 새로운 error 없음 확인
3. 개발 서버(localhost:3000) 기동 후 변경된 기능 직접 테스트
4. 엣지 케이스 1~2개 추가 테스트

검증 통과 시: git commit + git push origin main
실패 시: Developer에게 재작업 요청 후 1회 재시도
```

## Phase 4: 결과 보고

QA 결과를 사용자에게 보고한다.

성공:
```
✅ 완료
커밋: {커밋 해시}
변경 내용: {주요 변경 요약}
검증: tsc ✅ | lint ✅ | 런타임 ✅
```

실패:
```
❌ 실패
실패 항목: {항목}
에러: {에러 메시지}
```

## 데이터 흐름

```
사용자 요청
  → Analyst (_workspace/01_analyst_plan.md)
  → Developer (_workspace/02_developer_report.md)
  → QA (커밋 + 푸시)
  → 사용자 보고
```

## 에러 핸들링

| 에러 유형 | 처리 방법 |
|---------|---------|
| Analyst 분석 실패 | 에러 메시지와 함께 사용자에게 보고, 범위 힌트 요청 |
| Developer 구현 실패 (TypeScript 에러) | QA를 거치지 않고 Developer에게 재작업 요청 (1회) |
| QA 검증 실패 | QA가 Developer에게 재작업 요청, 최대 1회. 2회 실패 시 커밋하지 않고 에러 보고 |
| 개발 서버 기동 실패 | 빌드 에러를 캡처하여 사용자에게 보고 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "멤버 동기화 API의 쿨다운을 300초에서 600초로 변경해줘"
2. Analyst: `app/api/members/[id]/sync/route.ts` 탐색, `doSyncMember.ts` 쿨다운 상수 위치 확인, 계획 작성
3. Developer: 해당 파일 수정, 보고서 작성
4. QA: tsc → lint → curl로 API 호출하여 쿨다운 동작 확인 → 커밋/푸시

### 에러 흐름
1. Developer가 `any` 타입 사용 → QA의 tsc 검사에서 에러 발견
2. QA가 Developer에게 재작업 요청 (에러 메시지 포함)
3. Developer 수정 후 재전달
4. QA 재검증 → 통과 → 커밋/푸시

## 부분 재실행

이전 `_workspace/`가 존재할 때 사용자가 "다시 실행", "수정해줘", "이전 결과 기반으로" 등을 요청하면:
- Analyst 계획이 유효하면 Developer부터 재실행
- 새 요청이면 `_workspace/` → `_workspace_prev/` 이동 후 전체 재실행
