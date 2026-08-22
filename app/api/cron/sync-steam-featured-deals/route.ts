import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { syncSteamFeaturedDealSnapshot } from '@/lib/steam/featuredDealSnapshot'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = process.env.CRON_SECRET ?? process.env.ADMIN_SYNC_TOKEN
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncSteamFeaturedDealSnapshot()
    if (result.status === 'migration_required') return NextResponse.json({ error: 'Steam 할인 스냅샷 마이그레이션이 필요합니다.' }, { status: 503 })
    if (result.status === 'synced') {
      revalidatePath('/')
      revalidatePath('/steam')
    }
    return NextResponse.json({ ok: result.status === 'synced', ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : '오류 발생'
    console.error('[steam] cron featured deals sync 실패', message)
    return NextResponse.json({ error: 'Steam 할인 정보를 갱신하지 못했습니다.' }, { status: 502 })
  }
}
