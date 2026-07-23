// app/api/admin/sync-steam/route.ts
// GET  = Vercel Cron (Bearer CRON_SECRET / ADMIN_SYNC_TOKEN)
// POST = 관리자 수동 실행 (requireAdmin)
//
// /steam 페이지는 DB 만 읽는다. Steam API 호출은 이 라우트(와 스팀 최초 등록 시점)에서만 발생한다.
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/app/lib/isAdmin'
import {
  backfillAppDetails,
  listSteamMembers,
  syncSteamMembers,
} from '@/lib/sync/syncSteamMember'

export const maxDuration = 300

const DEFAULT_LIMIT = Number(process.env.STEAM_SYNC_BATCH ?? '50')

async function runSyncSteam(params: { limit?: number; appLimit?: number; trigger: 'cron' | 'manual' }) {
  const startedAt = Date.now()
  const limit = params.limit && params.limit > 0 ? params.limit : DEFAULT_LIMIT

  try {
    const members = await listSteamMembers(limit)
    const results = await syncSteamMembers(members)

    // 비공식 store API 실패가 전체 동기화를 깨뜨리면 안 된다.
    let appsChecked = 0
    try {
      appsChecked = await backfillAppDetails(params.appLimit)
    } catch (e) {
      console.error('[sync-steam] appDetails 백필 실패', e instanceof Error ? e.message : '오류 발생')
    }

    revalidatePath('/steam')

    const failed = results.filter((r) => !r.ok).length
    console.log('[sync-steam] end', {
      trigger: params.trigger,
      processed: results.length,
      failed,
      appsChecked,
      elapsedMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      ok: true,
      trigger: params.trigger,
      processed: results.length,
      failed,
      appsChecked,
      results,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : '오류 발생'
    console.error('[sync-steam] 실패', message)
    return NextResponse.json({ ok: false, message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { ok } = await requireAdmin()
  if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { limit?: unknown; appLimit?: unknown }
  const toNum = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : undefined)

  return runSyncSteam({ limit: toNum(body.limit), appLimit: toNum(body.appLimit), trigger: 'manual' })
}

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  const token = process.env.CRON_SECRET ?? process.env.ADMIN_SYNC_TOKEN
  if (!token || authHeader !== `Bearer ${token}`) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const toNum = (v: string | null) => (v && Number.isFinite(Number(v)) ? Number(v) : undefined)

  return runSyncSteam({
    limit: toNum(searchParams.get('limit')),
    appLimit: toNum(searchParams.get('appLimit')),
    trigger: 'cron',
  })
}
