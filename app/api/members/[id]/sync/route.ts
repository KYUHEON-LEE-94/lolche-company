import { NextResponse, after } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewerMember, isApprovedMember } from '@/lib/customGames/authorize'
import { syncOneMember, STUCK_RUNNING_MINUTES } from '@/lib/sync/syncMember'
import { doSyncMember } from '@/lib/sync/doSyncMember'
import { writeSyncLog } from '@/lib/sync/writeSyncLog'
import { notifyTop5EntriesIfAny } from '@/lib/sync/notifyTop5'

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
    .select('id, last_synced_at, last_sync_started_at, sync_status, user_id')
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
  const startedMs = member.last_sync_started_at ? new Date(member.last_sync_started_at).getTime() : null

  // 이미 다른 실행이 진행 중이면 쿨다운보다 먼저 알려준다(사용자에게 더 정확한 사유).
  // 실제 중복 실행 차단은 syncOneMember 의 조건부 claim 이 담당한다 — 이건 표시용 조기 응답이다.
  if (
    member.sync_status === 'running' &&
    startedMs !== null &&
    now - startedMs < STUCK_RUNNING_MINUTES * 60 * 1000
  ) {
    return inProgressResponse(memberId, t0, member.last_synced_at)
  }

  // ★ 쿨다운 기준은 마지막 "성공"이 아니라 마지막 "시도"까지 포함한다.
  //   last_synced_at 만 보면 실패하는 멤버(잘못된 Riot ID·Riot 장애)는 성공 기록이 갱신되지 않아
  //   버튼을 누를 때마다 재시도 5회가 통째로 다시 돌았다(레이트리밋 고갈).
  const syncedMs = member.last_synced_at ? new Date(member.last_synced_at).getTime() : null
  const lastMs =
    syncedMs === null ? startedMs : startedMs === null ? syncedMs : Math.max(syncedMs, startedMs)
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

  if (r.skipped === 'in_progress') {
    return inProgressResponse(memberId, t0, member.last_synced_at)
  }

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

  // 랭크 캐시가 바뀌었으니 ISR 랭킹 페이지 캐시를 무효화한다(동기화 즉시 반영).
  revalidatePath('/')
  revalidatePath('/tft')
  revalidatePath('/lol')

  // 수동 동기화도 prev 를 갱신하므로, 여기서 진입을 판정하지 않으면 그 진입 알림은 영영 유실된다.
  // 응답을 늦추지 않도록 after() 로 미루고, 실패해도 동기화 결과에는 영향이 없다.
  after(async () => {
    try {
      await notifyTop5EntriesIfAny(new Set([memberId]))
    } catch (e) {
      console.warn('[sync] TOP5 알림 실패', e instanceof Error ? e.message : '오류 발생')
    }
  })

  return NextResponse.json({
    ok: true,
    skipped: false,
    cooldownSec: MIN_SYNC_INTERVAL_SEC,
    nextAllowedInSec: MIN_SYNC_INTERVAL_SEC,
  })
}

async function inProgressResponse(memberId: string, t0: number, lastSyncedAt: string | null) {
  await writeSyncLog({
    type: 'manual',
    memberId,
    status: 'skipped',
    message: 'in_progress',
    durationMs: Date.now() - t0,
  })

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason: 'in_progress',
    cooldownSec: MIN_SYNC_INTERVAL_SEC,
    nextAllowedInSec: MIN_SYNC_INTERVAL_SEC,
    last_synced_at: lastSyncedAt,
  })
}
