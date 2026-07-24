import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewerMember, isApprovedMember } from '@/lib/customGames/authorize'
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

  // 무인증 호출은 Riot 레이트리밋 고갈 벡터이므로 로그인은 반드시 요구한다.
  const viewer = await getViewerMember()
  if (!viewer) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { data: member, error: mErr } = await supabaseAdmin
    .from('members')
    .select('id, last_synced_at, user_id')
    .eq('id', memberId)
    .single()

  if (mErr || !member) {
    return NextResponse.json({ ok: false, error: 'member not found' }, { status: 404 })
  }

  // 승인된 멤버라면 남의 랭크도 갱신할 수 있다 — 랭킹은 모두가 함께 보는 공개 데이터라
  // "내 것만" 제한은 실익 없이 UX만 해쳤다(다른 카드의 버튼이 403으로 실패).
  // 레이트리밋 방어는 권한이 아니라 아래 멤버 단위 쿨다운이 담당한다.
  // 본인 계정은 아직 미승인(pending)이어도 갱신할 수 있게 남겨 둔다.
  const isOwnMember = member.user_id !== null && member.user_id === viewer.userId
  if (!isOwnMember && !viewer.isAdmin && !isApprovedMember(viewer)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
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
