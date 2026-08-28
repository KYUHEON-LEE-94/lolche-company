import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { syncOfficialTftPatchNotes } from '@/lib/tft/patchNoteSync'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const token = process.env.CRON_SECRET ?? process.env.ADMIN_SYNC_TOKEN
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await syncOfficialTftPatchNotes(0)
    if (result.status === 'migration_required') return NextResponse.json({ error: '패치 노트 마이그레이션이 필요합니다.' }, { status: 503 })
    if (result.status === 'synced') {
      revalidatePath('/')
      revalidatePath('/tft')
    }
    return NextResponse.json({ ok: result.status === 'synced', ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : '오류 발생'
    console.error('[tft] cron patch note sync 실패', message)
    // detail 은 진단용(원인 특정). CRON_SECRET 인증을 통과한 호출에만 노출된다.
    return NextResponse.json({ error: '패치 노트를 동기화하지 못했습니다.', detail: message }, { status: 502 })
  }
}
