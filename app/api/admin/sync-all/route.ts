// app/api/admin/sync-all/route.ts
import { NextResponse, after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncOneMember, STUCK_RUNNING_MINUTES } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'
import { writeSyncLog } from '@/lib/sync/writeSyncLog'
import { notifyTop5EntriesIfAny } from '@/lib/sync/notifyTop5'
import { requireAdmin } from '@/app/lib/isAdmin'

export const maxDuration = 300

// 멤버당 최대 3개 계정의 리그를 조회하므로 배치 20이면 maxDuration(300s)을 넘길 수 있다.
const DEFAULT_BATCH = Number(process.env.SYNC_ALL_BATCH ?? '10')
const MEMBER_DELAY_MS = Number(process.env.RIOT_MEMBER_DELAY_MS ?? '800')
const STALE_HOURS = Number(process.env.SYNC_STALE_HOURS ?? '1')
// 실패 멤버 재시도 간격. 잘못된 Riot ID 는 매번 실패하므로 매 배치 슬롯을 차지하지 않게 한다.
const FAILED_BACKOFF_HOURS = Number(process.env.SYNC_FAILED_BACKOFF_HOURS ?? '3')

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 3600 * 1000).toISOString()
}

/**
 * ✅ Cron에서만 로그 TTL 정리 (성공: 7일, 나머지: 30일)
 */
async function cleanupSyncLogs() {
  const successBefore = isoDaysAgo(7)
  const othersBefore = isoDaysAgo(30)

  // success 7일 초과 삭제
  const { error: e1 } = await supabaseAdmin
      .from('sync_logs')
      .delete()
      .eq('status', 'success')
      .lt('created_at', successBefore)

  if (e1) console.error('[sync-all] cleanup success logs error', e1)

  // skipped/error 30일 초과 삭제
  const { error: e2 } = await supabaseAdmin
      .from('sync_logs')
      .delete()
      .neq('status', 'success')
      .lt('created_at', othersBefore)

  if (e2) console.error('[sync-all] cleanup other logs error', e2)

  console.log('[sync-all] cleanup done', { successBefore, othersBefore })
}

/**
 * 공용 실행 함수
 */
async function runSyncAll(params: {
  limit?: number
  cursorId?: string | null
  trigger: 'cron' | 'manual'
  doCleanup?: boolean
  req?: Request
}) {
  const startedAt = Date.now()
  const limit = params.limit ?? DEFAULT_BATCH
  const cursorId = params.cursorId ?? null

  const staleSince = new Date(Date.now() - STALE_HOURS * 3600 * 1000).toISOString()
  const stuckSince = new Date(Date.now() - STUCK_RUNNING_MINUTES * 60 * 1000).toISOString()
  const backoffSince = new Date(Date.now() - FAILED_BACKOFF_HOURS * 3600 * 1000).toISOString()

  const vercelCron = params.req?.headers.get('x-vercel-cron')
  console.log('[sync-all] start', {
    trigger: params.trigger,
    vercelCron,
    limit,
    cursorId,
    staleSince,
    stuckSince,
  })

  // ✅ cron일 때만 TTL 정리 (추가 cron 필요 없음)
  if (params.doCleanup) {
    await cleanupSyncLogs()
  }

  // 선정 규칙:
  //   fresh  — stale AND (상태 없음 | running·failed 아님)
  //   failed — stale AND failed AND 마지막 시도가 백오프 시간 이전 (잘못된 Riot ID 가 매 배치를 잠식하지 않게)
  //   stuck  — running 이 30분 이상 (stale 여부 무관하게 재시도)
  // 정렬은 "가장 오래 시도 안 한 멤버" 우선 → id 순 고정 정렬로 앞쪽 멤버만 반복 처리되던 기아를 막는다.
  //
  // ★ cursorId 는 받되 쓰지 않는다. 처리된 멤버는 success(stale 아님) / failed(백오프) /
  //   running(최근 started) 로 자연 제외되므로, 같은 조건을 반복 조회해도 진행이 보장된다.
  //   (id 커서와 last_sync_started_at 정렬은 함께 쓸 수 없다.)
  const stale = `or(last_synced_at.is.null,last_synced_at.lt.${staleSince})`
  const caseFresh = `and(${stale},or(sync_status.is.null,sync_status.not.in.(running,failed)))`
  const caseFailed = `and(${stale},sync_status.eq.failed,or(last_sync_started_at.is.null,last_sync_started_at.lt.${backoffSince}))`
  const caseStuck = `and(sync_status.eq.running,last_sync_started_at.lt.${stuckSince})`

  const { data: members, error } = await supabaseAdmin
      .from('members')
      .select('id, member_name, last_synced_at, sync_status')
      .neq('status', 'rejected')
      .or(`${caseFresh},${caseFailed},${caseStuck}`)
      .order('last_sync_started_at', { ascending: true, nullsFirst: true })
      .order('id', { ascending: true })
      .limit(limit)
  if (error) {
    console.error('[sync-all] members query error', error)
    return NextResponse.json({ error: '멤버 조회 실패', detail: String(error) }, { status: 500 })
  }

  if (!members || members.length === 0) {
    const { count: totalCount } = await supabaseAdmin
        .from('members')
        .select('*', { count: 'exact', head: true })

    const { count: runningCount } = await supabaseAdmin
        .from('members')
        .select('*', { count: 'exact', head: true })
        .eq('sync_status', 'running')

    console.log('[sync-all] empty result debug', { totalCount, runningCount })
  }

  console.log('[sync-all] fetched members', { count: members?.length ?? 0 })

  type SyncResultItem = {
    memberId: string
    memberName: string
    ok: boolean
    status: number | string
    error: string | null
    durationMs: number
  }
  const results: SyncResultItem[] = []

  for (const m of members ?? []) {
    const t0 = Date.now()

    try {
      const r = await syncOneMember(m.id, doSyncMember)
      // 다른 실행(수동 버튼·겹친 크론)이 이미 running 이면 claim 에 져서 아무것도 하지 않았다.
      const skipped = r.skipped === 'in_progress'

      const status: 'success' | 'error' | 'skipped' = skipped ? 'skipped' : r.ok ? 'success' : 'error'

      // ✅ 멤버별 DB 로그
      await writeSyncLog({
        type: params.trigger === 'cron' ? 'cron' : 'manual',
        memberId: m.id,
        status,
        message: skipped
            ? 'in_progress'
            : r.error
            ? r.error
            : r.status != null
                ? String(r.status)
                : null,
        durationMs: Date.now() - t0,
      })

      // ✅ 멤버별 콘솔 로그
      console.log('[sync-all] member result', {
        memberId: m.id,
        memberName: m.member_name,
        ok: r.ok,
        status: r.status,
        error: r.error ?? null,
        durationMs: Date.now() - t0,
      })

      results.push({
        memberId: m.id,
        memberName: m.member_name,
        ok: r.ok,
        status: skipped ? 'skipped' : r.status,
        error: r.error ?? null,
        durationMs: Date.now() - t0,
      })
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : 'member sync exception'
      console.error('[sync-all] member exception', { memberId: m.id, e })

      await writeSyncLog({
        type: params.trigger === 'cron' ? 'cron' : 'manual',
        memberId: m.id,
        status: 'error',
        message: errMsg,
        durationMs: Date.now() - t0,
      })

      results.push({
        memberId: m.id,
        memberName: m.member_name,
        ok: false,
        status: 'error',
        error: errMsg,
        durationMs: Date.now() - t0,
      })
    }

    if (MEMBER_DELAY_MS > 0) await sleep(MEMBER_DELAY_MS)
  }

  const nextCursorId = members && members.length ? members[members.length - 1].id : cursorId
  const done = !members || members.length < limit

  // ★ 동기화가 members 랭크 캐시를 바꿨으니 ISR 랭킹 페이지 캐시를 무효화한다.
  //   (revalidate=60 만으로는 배포·저트래픽 환경에서 stale 이 오래 남을 수 있다.)
  if (results.length > 0) {
    revalidatePath('/')
    revalidatePath('/tft')
    revalidatePath('/lol')
  }

  // TOP5 신규 진입 알림(실패해도 동기화엔 영향 없음).
  // ★ `done` 으로 거르지 않는다 — 배치가 limit 미만이면 거의 매 호출 true 라 같은 진입자가 반복 발송됐다.
  //   대신 이번 배치에서 실제로 성공한 멤버만 후보로 넘긴다(skipped·실패 제외).
  const syncedIds = new Set(results.filter((r) => r.ok).map((r) => r.memberId))
  if (syncedIds.size > 0) {
    try { await notifyTop5EntriesIfAny(syncedIds) } catch (e) { console.warn('[sync-all] TOP5 알림 실패', e instanceof Error ? e.message : '오류') }
  }

  console.log('[sync-all] end', {
    processed: results.length,
    done,
    nextCursorId,
    elapsedMs: Date.now() - startedAt,
  })

  return NextResponse.json({
    batch: { limit, cursorId, nextCursorId, done },
    processed: results.length,
    results,
  })
}

/**
 * ✅ POST: 관리자 수동 실행
 */
export async function POST(req: Request) {
  const { ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const parsedLimit = Number.isFinite(Number(body.limit)) ? Number(body.limit) : undefined
  return runSyncAll({
    limit: parsedLimit,
    cursorId: body.cursorId ?? null,
    trigger: 'manual',
    doCleanup: false,
    req,
  })
}

/**
 * ✅ GET: 외부 크론(cron-job.org) 실행
 *
 * ⚠ 배치 동기화는 멤버당 ~8초(매치 상세 1200ms 대기)라 응답까지 30초를 넘기기 쉽다.
 * cron-job.org 의 요청 타임아웃은 30초(무료)라 동기적으로 처리하면 실제로는 성공(200)해도
 * 크론 쪽은 "Failed (timeout)" 으로 기록하고, 반복되면 job 을 자동 비활성화한다.
 * → 여기서는 **작업을 after() 로 예약하고 즉시 202 를 반환**한다. 실제 동기화는 응답 이후
 *   백그라운드(Vercel waitUntil, maxDuration=300s 내)에서 끝난다. 크론은 곧바로 응답을 받는다.
 * 커서 체이닝은 쓰지 않는다 — cron-job.org 는 같은 URL 을 주기적으로 부르고, 매 호출마다
 * 서버가 "stale 1시간+"만 골라 처리하므로 반복 호출이 안전하다(중복은 stale/running 가드가 막음).
 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = process.env.CRON_SECRET ?? process.env.ADMIN_SYNC_TOKEN
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const raw = searchParams.get('limit')
  const parsedLimit = raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined
  const cursorId = searchParams.get('cursorId')

  after(async () => {
    try {
      await runSyncAll({ limit: parsedLimit, cursorId, trigger: 'cron', doCleanup: true, req })
    } catch (e) {
      console.error('[sync-all] background run failed', e instanceof Error ? e.message : e)
    }
  })

  // 크론은 이 응답만 보고 성공으로 기록한다. 실제 결과는 Vercel 로그·sync_logs 에서 확인.
  return NextResponse.json({ scheduled: true, trigger: 'cron' }, { status: 202 })
}
