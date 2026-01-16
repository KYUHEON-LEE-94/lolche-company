// lib/sync/writeSyncLog.ts
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type SyncLogType = 'manual' | 'cron'
export type SyncLogStatus = 'success' | 'skipped' | 'error'

export async function writeSyncLog(input: {
    type: SyncLogType
    memberId: string
    status: SyncLogStatus
    message?: string | null
    durationMs?: number | null
}) {
    try {
        const { error } = await supabaseAdmin.from('sync_logs').insert([
            {
                type: input.type,
                member_id: input.memberId,
                status: input.status,
                message: input.message ?? null,
                duration_ms: input.durationMs ?? null,
            },
        ])

        // 로그 실패가 sync 자체를 망치면 안 되므로 throw 금지
        if (error) {
            console.error('sync_logs insert error', error)
        }
    } catch (e) {
        console.error('sync_logs insert exception', e)
    }
}
