import 'server-only'

import { randomUUID } from 'node:crypto'
import { isMissingFunctionError, isMissingTableError } from '@/lib/db/pgErrors'
import { fetchSteamFeaturedDeals } from '@/lib/steam/featuredDeals'
import { isSteamFeaturedDeal, type SteamFeaturedDeal } from '@/lib/steam/featuredDealsShared'
import { supabaseService } from '@/lib/supabase/service'

type SyncClaim = { status: string; retry_after_seconds: number }
type SyncFinish = { status: string; last_success_at: string | null }

export type SteamFeaturedDealSyncResult =
  | { status: 'synced'; count: number; syncedAt: string | null }
  | { status: 'locked'; retryAfterSeconds: number }
  | { status: 'migration_required' }

function firstRow<T>(data: T[] | null): T | null {
  return Array.isArray(data) ? data[0] ?? null : null
}

function validSnapshot(value: unknown): SteamFeaturedDeal[] | null {
  if (!Array.isArray(value) || !value.every(isSteamFeaturedDeal)) return null
  return value
}

export async function getSteamFeaturedDealSnapshot(): Promise<SteamFeaturedDeal[] | null> {
  const { data, error } = await supabaseService
    .from('steam_featured_deal_snapshots')
    .select('deals')
    .eq('id', true)
    .maybeSingle()
  if (error) {
    if (!isMissingTableError(error)) console.error('[steam] 할인 스냅샷 조회 실패', error.message)
    return null
  }
  return validSnapshot(data?.deals)
}

async function releaseLock(lockToken: string) {
  const { error } = await supabaseService.rpc('finish_steam_featured_deal_sync', {
    p_lock_token: lockToken,
    p_success: false,
  })
  if (error && !isMissingFunctionError(error)) console.error('[steam] 할인 동기화 lock 해제 실패', error.message)
}

export async function syncSteamFeaturedDealSnapshot(): Promise<SteamFeaturedDealSyncResult> {
  const lockToken = randomUUID()
  const { data: claimData, error: claimError } = await supabaseService.rpc('claim_steam_featured_deal_sync', {
    p_lock_token: lockToken,
  })
  if (claimError) {
    if (isMissingFunctionError(claimError) || isMissingTableError(claimError)) return { status: 'migration_required' }
    throw new Error(`할인 동기화를 시작하지 못했습니다: ${claimError.message}`)
  }
  const claim = firstRow(claimData as SyncClaim[] | null)
  if (!claim || claim.status === 'locked') return { status: 'locked', retryAfterSeconds: Math.max(1, claim?.retry_after_seconds ?? 60) }
  if (claim.status !== 'claimed') throw new Error('할인 동기화 상태를 확인하지 못했습니다.')

  const deals = await fetchSteamFeaturedDeals()
  if (deals === null) {
    await releaseLock(lockToken)
    throw new Error('Steam 할인 정보를 가져오지 못했습니다.')
  }

  const { data: replaceData, error: replaceError } = await supabaseService.rpc('replace_steam_featured_deal_snapshot', {
    p_lock_token: lockToken,
    p_deals: deals,
  })
  if (replaceError) {
    await releaseLock(lockToken)
    if (isMissingFunctionError(replaceError) || isMissingTableError(replaceError)) return { status: 'migration_required' }
    throw new Error(`할인 스냅샷 저장에 실패했습니다: ${replaceError.message}`)
  }
  const result = firstRow(replaceData as SyncFinish[] | null)
  if (!result || result.status !== 'replaced') throw new Error('할인 스냅샷 저장 권한을 확인하지 못했습니다.')
  return { status: 'synced', count: deals.length, syncedAt: result.last_success_at }
}
