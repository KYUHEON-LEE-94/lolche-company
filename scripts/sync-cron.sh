#!/bin/bash

APP_DIR="/Users/xman0922/IdeaProjects/lolche-company"
APP_URL="http://localhost:3000"
LOG_FILE="$APP_DIR/logs/sync-cron.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
SERVER_STARTED_BY_CRON=false

log() {
  echo "[$TIMESTAMP] $1" >> "$LOG_FILE"
}

# 인터넷 연결 확인
if ! curl -sf --max-time 5 https://www.google.com -o /dev/null 2>/dev/null; then
  log "SKIP - 인터넷 연결 없음"
  exit 0
fi

# Next.js 서버 실행 확인 → 안 떠 있으면 직접 기동
if ! curl -sf --max-time 3 "$APP_URL" -o /dev/null 2>/dev/null; then
  log "INFO - Next.js 서버 미실행, 기동 시작"

  # 3000 포트 사용 중인 프로세스 정리
  PIDS=$(lsof -ti :3000 2>/dev/null)
  if [ -n "$PIDS" ]; then
    log "INFO - 포트 3000 점유 프로세스($PIDS) 종료"
    kill $PIDS 2>/dev/null
    sleep 2
  fi

  # Next.js 기동 (백그라운드)
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"

  cd "$APP_DIR"
  npm run dev >> "$APP_DIR/logs/nextjs-cron.log" 2>&1 &
  SERVER_STARTED_BY_CRON=true
  log "INFO - Next.js 기동 요청 완료 (PID: $!), 준비 대기 중..."

  # 최대 60초 대기 (2초 간격 30회)
  READY=false
  for i in $(seq 1 30); do
    sleep 2
    if curl -sf --max-time 3 "$APP_URL" -o /dev/null 2>/dev/null; then
      READY=true
      break
    fi
  done

  if [ "$READY" = false ]; then
    log "ERROR - Next.js 60초 내 기동 실패"
    exit 1
  fi

  log "INFO - Next.js 준비 완료 (${i}번째 시도)"
fi

# sync-all 호출 (전체 멤버, cursor 페이지네이션)
log "START - 전체 멤버 동기화 시작"

CURSOR=""
TOTAL=0
ERRORS=0
PAGE=1

while true; do
  URL="$APP_URL/api/admin/sync-all?limit=50"
  if [ -n "$CURSOR" ]; then
    URL="$URL&cursorId=$CURSOR"
  fi

  RESPONSE=$(curl -sf --max-time 300 "$URL" 2>/dev/null)
  if [ $? -ne 0 ] || [ -z "$RESPONSE" ]; then
    log "ERROR - sync-all 호출 실패 (page $PAGE)"
    break
  fi

  PROCESSED=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('processed',0))" 2>/dev/null)
  DONE=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['batch']['done'])" 2>/dev/null)
  NEXT_CURSOR=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['batch'].get('nextCursorId') or '')" 2>/dev/null)
  PAGE_ERRORS=$(echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('results',[]); print(sum(1 for x in r if not x['ok']))" 2>/dev/null)

  TOTAL=$((TOTAL + PROCESSED))
  ERRORS=$((ERRORS + PAGE_ERRORS))

  log "  page $PAGE - processed=$PROCESSED, errors=$PAGE_ERRORS"

  if [ "$DONE" = "True" ] || [ -z "$NEXT_CURSOR" ]; then
    break
  fi

  CURSOR="$NEXT_CURSOR"
  PAGE=$((PAGE + 1))
done

log "END - 총 $TOTAL 명 처리, 실패 $ERRORS 명"
