# 분석 결과

## 작업 요약
`MemberDetailPanel.tsx`의 두 개의 빈 catch 블록(`.catch(() => {})`)을 CLAUDE.md catch 패턴에 맞춰 `console.error`로 최소 로깅하도록 개선한다.

## 영향 파일 목록
| 파일 경로 | 변경 유형 | 이유 |
|-----------|---------|------|
| `app/components/ranking/MemberDetailPanel.tsx` | 수정 | 191행, 197행의 `.catch(() => {})` 빈 catch 블록이 fetch 에러를 무음으로 삼켜 디버깅 불가 |

## 발견된 문제 위치
- **191행** — history fetch `.catch(() => {})`
- **197행** — matches fetch `.catch(() => {})`

두 블록 모두 인자도 받지 않고 본문도 비어 있어 CLAUDE.md catch 규칙 위반.

## 구현 계획
1. 191행 `.catch(() => {})` 교체:
   ```ts
   .catch((e) => console.error('history fetch 실패:', e instanceof Error ? e.message : '오류 발생'))
   ```
2. 197행 `.catch(() => {})` 교체:
   ```ts
   .catch((e) => console.error('matches fetch 실패:', e instanceof Error ? e.message : '오류 발생'))
   ```
3. `.finally()` 체인은 그대로 유지.
4. 변경은 두 곳에 한정 — 그 외 코드 수정 없음.

## 위험 요소
- 사이드 이펙트 없음. `.finally()`가 catch와 별도로 항상 실행되므로 로딩 상태 해제 동작 유지.
- 에러 시 빈 배열 fallback(`?? []`)도 그대로 유지되어 UI 동작 동일.
- `console.error`는 민감정보 노출 위험 낮음 (멤버 ID/에러 메시지 수준).

## 검증 포인트
- 정상 응답 시 history/matches 정상 렌더링 (회귀 없음).
- API 실패 시 브라우저 콘솔에 에러 메시지 출력 확인.
- API 실패 시에도 로딩 스피너 정상 해제 및 빈 상태 fallback 확인.
- `npx tsc --noEmit` 통과, `npm run lint` 통과.
- diff가 191/197행 두 곳에 한정되는지 확인.
