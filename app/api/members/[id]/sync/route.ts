import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { doSyncMember } from '@/lib/sync/doSyncMember'

const MIN_SYNC_INTERVAL_SEC = Number(process.env.MIN_SYNC_INTERVAL_SEC ?? '300')

export async function POST(
    _req: Request,
    ctx: { params: Promise<{ id: string }> } // ✅ params가 Promise
) {
  const { id: memberId } = await ctx.params // ✅ await로 unwrap

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
    return NextResponse.json({
      ok: true,
      skipped: false,
      cooldownSec: MIN_SYNC_INTERVAL_SEC,
      nextAllowedInSec: MIN_SYNC_INTERVAL_SEC,
      result,
    })
  } catch (e: any) {
    return NextResponse.json(
        { ok: false, error: e?.message ?? 'sync failed' },
        { status: 500 }
    )
  }
}
