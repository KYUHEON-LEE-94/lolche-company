import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { RiotApiError } from '@/lib/riot/api'

const MAX_RETRY = Number(process.env.RIOT_MAX_RETRY ?? '5')
const BASE_BACKOFF_MS = Number(process.env.RIOT_BACKOFF_BASE_MS ?? '1000')
const MAX_BACKOFF_MS = Number(process.env.RIOT_BACKOFF_MAX_MS ?? '16000')
const RIOT_429_FALLBACK_MS = Number(process.env.RIOT_429_DELAY_MS ?? '30000')
// running 이 이 시간 이상 지속되면 죽은 실행(함수 타임아웃 등)으로 보고 다시 claim 을 허용한다.
// sync-all 의 stuck 선정 기준과 반드시 같은 값을 쓴다.
export const STUCK_RUNNING_MINUTES = 30

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function backoffMs(attempt: number) {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1))
  const jitter = Math.floor(Math.random() * 300)
  return base + jitter
}

function isRetryableStatus(status: number) {
  // 520~524 는 Cloudflare 가 Riot origin 장애 시 반환하는 일시적 5xx 다(520=unknown error 등).
  // 즉시 실패시키지 말고 백오프 재시도로 짧은 블립을 넘긴다.
  return (
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    (status >= 520 && status <= 524)
  )
}

export class SyncError extends Error {
  status: number
  retryAfterSec?: number
  constructor(message: string, status: number, retryAfterSec?: number) {
    super(message)
    this.name = 'SyncError'
    this.status = status
    this.retryAfterSec = retryAfterSec
  }
}

export type SyncResult = {
  ok: boolean
  status: number
  error?: string | null
  /** 다른 실행이 이미 running 이라 이번 호출은 아무것도 하지 않았다. 실패가 아니다. */
  skipped?: 'in_progress'
}

export async function syncOneMember(
  memberId: string,
  doSync: (memberId: string) => Promise<void>,
): Promise<SyncResult> {
  const startedAt = new Date().toISOString()

  const stuckSince = new Date(Date.now() - STUCK_RUNNING_MINUTES * 60 * 1000).toISOString()

  // ★ 조건부 claim: running 이 아니거나(혹은 stuck) 일 때만 running 으로 전이한다.
  //   무조건 마킹하면 수동 버튼 연타·크론과 수동의 겹침이 같은 멤버를 동시에 동기화해
  //   Riot 호출이 배로 들고 prev 기록이 꼬인다. 단일 UPDATE 의 WHERE 라 경합에도 1건만 이긴다.
  const { data: m0, error: claimError } = await supabaseAdmin
    .from('members')
    .update({
      sync_status: 'running',
      last_sync_started_at: startedAt,
      last_sync_error: null,
    })
    .eq('id', memberId)
    .or(
      `sync_status.is.null,sync_status.neq.running,last_sync_started_at.is.null,last_sync_started_at.lt.${stuckSince}`,
    )
    .select('sync_attempts')
    .maybeSingle()

  if (claimError) return { ok: false, status: 500, error: claimError.message }
  if (!m0) return { ok: false, status: 409, error: null, skipped: 'in_progress' }

  await supabaseAdmin
    .from('members')
    .update({ sync_attempts: (m0.sync_attempts ?? 0) + 1 })
    .eq('id', memberId)

  let lastStatus = 0
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      await doSync(memberId)

      await supabaseAdmin
        .from('members')
        .update({
          sync_status: 'success',
          last_sync_finished_at: new Date().toISOString(),
          last_sync_error: null,
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', memberId)

      return { ok: true, status: 200 }
    } catch (e) {
      if (e instanceof SyncError || e instanceof RiotApiError) {
        lastStatus = e.status
        lastError = e.message

        if (!isRetryableStatus(e.status)) break

        const waitMs =
          e.status === 429
            ? (e.retryAfterSec ? e.retryAfterSec * 1000 : RIOT_429_FALLBACK_MS)
            : backoffMs(attempt)

        if (attempt === MAX_RETRY) break
        await sleep(waitMs)
        continue
      }

      lastStatus = 0
      lastError = `unexpected error: ${String(e)}`
      if (attempt === MAX_RETRY) break
      await sleep(backoffMs(attempt))
    }
  }

  await supabaseAdmin
    .from('members')
    .update({
      sync_status: 'failed',
      last_sync_finished_at: new Date().toISOString(),
      last_sync_error: lastError ?? `unknown error (status=${lastStatus})`,
    })
    .eq('id', memberId)

  return { ok: false, status: lastStatus, error: lastError }
}
