import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { syncOneMember } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'
import { writeSyncLog } from '@/lib/sync/writeSyncLog'

const MIN_SYNC_INTERVAL_SEC = Number(process.env.MIN_SYNC_INTERVAL_SEC ?? '300')

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const t0 = Date.now()
  const { id: memberId } = await ctx.params

  const { data: member, error: mErr } = await supabaseAdmin
    .from('members')
    .select('id, last_synced_at')
    .eq('id', memberId)
    .single()

  if (mErr || !member) {
    return NextResponse.json({ ok: false, error: 'member not found' }, { status: 404 })
  }

  const now = Date.now()
  const lastMs = member.last_synced_at ? new Date(member.last_synced_at).getTime() : null
  const diffSec = lastMs ? Math.floor((now - lastMs) / 1000) : null
  const nextAllowedInSec =
    diffSec === null ? 0 : Math.max(0, MIN_SYNC_INTERVAL_SEC - diffSec)

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

  const r = await syncOneMember(memberId, doSyncMember)

  await writeSyncLog({
    type: 'manual',
    memberId,
    status: r.ok ? 'success' : 'error',
    message: r.error ?? null,
    durationMs: Date.now() - t0,
  })

  if (!r.ok) {
    return NextResponse.json(
      { ok: false, error: r.error },
      { status: r.status || 500 },
    )
  }

  return NextResponse.json({
    ok: true,
    skipped: false,
    cooldownSec: MIN_SYNC_INTERVAL_SEC,
    nextAllowedInSec: MIN_SYNC_INTERVAL_SEC,
  })
}
