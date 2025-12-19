// lib/riot/syncMember.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const MAX_RETRY = Number(process.env.RIOT_MAX_RETRY ?? '5')
const BASE_BACKOFF_MS = Number(process.env.RIOT_BACKOFF_BASE_MS ?? '1000')
const MAX_BACKOFF_MS = Number(process.env.RIOT_BACKOFF_MAX_MS ?? '16000')
const RIOT_429_FALLBACK_MS = Number(process.env.RIOT_429_DELAY_MS ?? '30000')

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function backoffMs(attempt: number) {
  const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** (attempt - 1))
  const jitter = Math.floor(Math.random() * 300)
  return base + jitter
}

function isRetryableStatus(status: number) {
  return status === 429 || status === 502 || status === 503 || status === 504
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

type SyncResult = {
  ok: boolean
  status: number
  error?: string | null
}

export async function syncOneMember(
    memberId: string,
    doSync: (memberId: string) => Promise<void>,
): Promise<SyncResult> {
  const startedAt = new Date().toISOString()

  // running 마킹 + attempts 증가
  await supabaseAdmin
  .from('members')
  .update({
    sync_status: 'running',
    last_sync_started_at: startedAt,
    last_sync_error: null,
  })
  .eq('id', memberId)

  const { data: m0 } = await supabaseAdmin
  .from('members')
  .select('sync_attempts')
  .eq('id', memberId)
  .single()

  await supabaseAdmin
  .from('members')
  .update({ sync_attempts: (m0?.sync_attempts ?? 0) + 1 })
  .eq('id', memberId)

  let lastStatus = 0
  let lastError: string | null = null

  for (let attempt = 1; attempt <= MAX_RETRY; attempt++) {
    try {
      // ✅ 실제 작업(riot 호출 + 데이터 업데이트)
      await doSync(memberId)

      // ✅ 최종 성공 처리(여기서 last_synced_at 포함)
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
      if (e instanceof SyncError) {
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

      // 예상 못한 에러(파싱/DB 등)도 재시도는 하되, status=0
      lastStatus = 0
      lastError = `unexpected error: ${String(e)}`
      const waitMs = backoffMs(attempt)
      if (attempt === MAX_RETRY) break
      await sleep(waitMs)
    }
  }

  // 실패 처리
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