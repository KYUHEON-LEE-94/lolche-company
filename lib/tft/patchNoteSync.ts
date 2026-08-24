import 'server-only'

import { randomUUID } from 'node:crypto'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseService } from '@/lib/supabase/service'
import { fetchOfficialTftPatchNotes } from '@/lib/tft/officialPatchNotes'

const AUTOMATED_CONTENT = '롤체 공식 패치 노트입니다. 자세한 변경 사항은 공식 링크에서 확인해주세요.'

export type PatchNoteSyncResult =
  | { status: 'synced'; syncedAt: string | null; count: number }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'cooldown'; retryAfterSeconds: number }
  | { status: 'migration_required' }
  | { status: 'source_unavailable'; reason: string }

function firstResult<T>(data: T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : null
}

export async function syncOfficialTftPatchNotes(minIntervalSeconds: number): Promise<PatchNoteSyncResult> {
  const lockToken = randomUUID()
  const { data: claimData, error: claimError } = await supabaseService.rpc('claim_tft_patch_note_sync', {
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

  // ★ 외부 공식 페이지 조회는 Riot CDN 차단/장애로 실패할 수 있다. 이건 "우리 버그"가 아니라
  //   외부 의존성 degrade 다 — 502 로 크론(GitHub Action)을 실패시키지 말고, lock 만 풀고
  //   source_unavailable 로 소프트 반환한다. 기존 저장된 패치 노트는 그대로 유지된다(다음 실행 재시도).
  let notes: Awaited<ReturnType<typeof fetchOfficialTftPatchNotes>>
  try {
    notes = await fetchOfficialTftPatchNotes()
  } catch (fetchError) {
    const reason = fetchError instanceof Error ? fetchError.message : '외부 소스 조회 실패'
    const { error: finishError } = await supabaseService.rpc('finish_tft_patch_note_sync', { p_lock_token: lockToken, p_success: false })
    if (finishError) console.error('[tft] 패치 노트 lock 해제 실패', finishError.message)
    console.warn('[tft] 공식 패치 노트 소스 조회 실패(degrade)', reason)
    return { status: 'source_unavailable', reason }
  }

  let syncedCount = 0
  try {
    const { data: activeSeason, error: seasonError } = await supabaseService
      .from('seasons').select('id').eq('is_active', true).maybeSingle()
    if (seasonError) throw new Error(`현재 시즌 조회 실패: ${seasonError.message}`)
    if (!activeSeason) throw new Error('활성 시즌이 없어 패치 노트를 저장할 수 없습니다.')
    if (notes.length > 0) {
      const { error } = await supabaseService.from('tft_patch_notes').upsert(
        notes.map((note) => ({
          season_id: activeSeason.id,
          title: note.title,
          summary: note.summary,
          content: AUTOMATED_CONTENT,
          is_published: true,
          published_at: note.publishedAt,
          source_key: note.sourceKey,
          source_url: note.sourceUrl,
          source_published_at: note.publishedAt,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: 'source_key' },
      )
      if (error) throw new Error(`공식 패치 노트 저장 실패: ${error.message}`)
    }
    syncedCount = notes.length
  } catch (e) {
    const { data: finishData, error: finishError } = await supabaseService.rpc('finish_tft_patch_note_sync', {
      p_lock_token: lockToken,
      p_success: false,
    })
    if (finishError) console.error('[tft] 패치 노트 lock 해제 실패', finishError.message)
    void finishData
    throw e
  }
  const { data: finishData, error: finishError } = await supabaseService.rpc('finish_tft_patch_note_sync', {
    p_lock_token: lockToken,
    p_success: true,
  })
  if (finishError) throw new Error(`패치 노트 동기화를 완료하지 못했습니다: ${finishError.message}`)
  const finish = firstResult(finishData)
  return { status: 'synced', syncedAt: finish?.last_success_at ?? null, count: syncedCount }
}
