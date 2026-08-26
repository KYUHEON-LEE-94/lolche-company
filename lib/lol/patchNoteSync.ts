import 'server-only'

import { randomUUID } from 'node:crypto'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseService } from '@/lib/supabase/service'
import { fetchOfficialLolPatchNotes } from '@/lib/lol/officialPatchNotes'

export type LolPatchNoteSyncResult =
  | { status: 'synced'; syncedAt: string | null; count: number }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'cooldown'; retryAfterSeconds: number }
  | { status: 'migration_required' }
  | { status: 'source_unavailable'; reason: string }

function firstResult<T>(data: T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : null
}

export async function syncOfficialLolPatchNotes(minIntervalSeconds: number): Promise<LolPatchNoteSyncResult> {
  const lockToken = randomUUID()
  const { data: claimData, error: claimError } = await supabaseService.rpc('claim_lol_patch_note_sync', {
    p_lock_token: lockToken,
    p_min_interval_seconds: minIntervalSeconds,
  })
  if (claimError) {
    if (isMissingFunctionError(claimError) || isMissingTableError(claimError)) return { status: 'migration_required' }
    throw new Error(`패치 노트 동기화를 시작하지 못했습니다: ${claimError.message}`)
  }
  const claim = firstResult(claimData)
  if (!claim || claim.status === 'locked') return { status: 'locked', retryAfterSeconds: Math.max(1, claim?.retry_after_seconds ?? 60) }
  if (claim.status === 'cooldown') return { status: 'cooldown', retryAfterSeconds: Math.max(1, claim.retry_after_seconds) }
  if (claim.status !== 'claimed') throw new Error('패치 노트 동기화 상태를 확인하지 못했습니다.')

  // ★ 외부 공식 페이지 조회 실패(Riot CDN 차단/장애)는 치명 오류가 아니다 — lock 만 풀고 degrade 한다.
  let notes: Awaited<ReturnType<typeof fetchOfficialLolPatchNotes>>
  try {
    notes = await fetchOfficialLolPatchNotes()
  } catch (fetchError) {
    const reason = fetchError instanceof Error ? fetchError.message : '외부 소스 조회 실패'
    const { error: finishError } = await supabaseService.rpc('finish_lol_patch_note_sync', { p_lock_token: lockToken, p_success: false })
    if (finishError) console.error('[lol] 패치 노트 lock 해제 실패', finishError.message)
    console.warn('[lol] 공식 패치 노트 소스 조회 실패(degrade)', reason)
    return { status: 'source_unavailable', reason }
  }

  let syncedCount = 0
  try {
    if (notes.length > 0) {
      const { error } = await supabaseService.from('lol_patch_notes').upsert(
        notes.map((note) => ({
          title: note.title,
          summary: note.summary,
          source_key: note.sourceKey,
          source_url: note.sourceUrl,
          published_at: note.publishedAt,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'source_key' },
      )
      if (error) throw new Error(`공식 패치 노트 저장 실패: ${error.message}`)
    }
    syncedCount = notes.length
  } catch (e) {
    const { error: finishError } = await supabaseService.rpc('finish_lol_patch_note_sync', { p_lock_token: lockToken, p_success: false })
    if (finishError) console.error('[lol] 패치 노트 lock 해제 실패', finishError.message)
    throw e
  }
  const { data: finishData, error: finishError } = await supabaseService.rpc('finish_lol_patch_note_sync', {
    p_lock_token: lockToken,
    p_success: true,
  })
  if (finishError) throw new Error(`패치 노트 동기화를 완료하지 못했습니다: ${finishError.message}`)
  const finish = firstResult(finishData)
  return { status: 'synced', syncedAt: finish?.last_success_at ?? null, count: syncedCount }
}
