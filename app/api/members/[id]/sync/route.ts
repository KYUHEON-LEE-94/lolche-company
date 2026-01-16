import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { doSyncMember } from '@/lib/sync/doSyncMember'
import { writeSyncLog } from '@/lib/sync/writeSyncLog'

const MIN_SYNC_INTERVAL_SEC = Number(process.env.MIN_SYNC_INTERVAL_SEC ?? '300')

export async function POST(
    _req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
  const t0 = Date.now() // ✅ (1) 시작 시간

  const { id: memberId } = await ctx.params

  const { data: member, error: mErr } = await supabaseAdmin
      .from('members')
      .select('id, last_synced_at')
      .eq('id', memberId)
      .single()

  if (mErr || !member) {
    // ✅ (옵션) not found도 로그 남기고 싶으면 여기서 error로 남겨도 됨
    return NextResponse.json({ ok: false, error: 'member not found' }, { status: 404 })
  }

  const now = Date.now()
  const lastMs = member.last_synced_at ? new Date(member.last_synced_at).getTime() : null
  const diffSec = lastMs ? Math.floor((now - lastMs) / 1000) : null
  const nextAllowedInSec =
      diffSec === null ? 0 : Math.max(0, MIN_SYNC_INTERVAL_SEC - diffSec)

  // ✅ (2) 쿨다운 스킵 로그: return 직전에
  if (nextAllowedInSec > 0) {
    await writeSyncLog({
      type: 'manual',
      memberId,
      status: 'skipped',
      message: `cooldown ${nextAllowedInSec}s`,
      durationMs: Date.now() - t0,
    })

    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'cooldown',
      cooldownSec: MIN_SYNC_INTERVAL_SEC,
      nextAllowedInSec,
      last_synced_at: member.last_synced_at,
    })
  }

  try {
    const result = await doSyncMember(memberId)

    // ✅ (3) 성공 로그: 응답 직전에
    await writeSyncLog({
      type: 'manual',
      memberId,
      status: 'success',
      durationMs: Date.now() - t0,
    })

    return NextResponse.json({
      ok: true,
      skipped: false,
      cooldownSec: MIN_SYNC_INTERVAL_SEC,
      nextAllowedInSec: MIN_SYNC_INTERVAL_SEC,
      result,
    })
  } catch (e: any) {
    // ✅ (4) 실패 로그: 응답 직전에
    await writeSyncLog({
      type: 'manual',
      memberId,
      status: 'error',
      message: e?.message ?? 'sync failed',
      durationMs: Date.now() - t0,
    })

    return NextResponse.json(
        { ok: false, error: e?.message ?? 'sync failed' },
        { status: 500 }
    )
  }
}
