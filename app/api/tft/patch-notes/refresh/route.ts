import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { syncOfficialTftPatchNotes } from '@/lib/tft/patchNoteSync'

export const dynamic = 'force-dynamic'
const MANUAL_REFRESH_INTERVAL_SECONDS = 600

export async function POST() {
  try {
    const result = await syncOfficialTftPatchNotes(MANUAL_REFRESH_INTERVAL_SECONDS)
    if (result.status === 'migration_required') return NextResponse.json({ error: '패치 노트 마이그레이션이 필요합니다.' }, { status: 503 })
    if (result.status === 'cooldown') return NextResponse.json({ error: '최근에 갱신되었습니다.', retryAfterSeconds: result.retryAfterSeconds }, { status: 429 })
    if (result.status === 'locked') return NextResponse.json({ error: '다른 갱신 요청이 진행 중입니다.', retryAfterSeconds: result.retryAfterSeconds }, { status: 409 })
    if (result.status === 'source_unavailable') return NextResponse.json({ error: '공식 패치 노트 페이지를 지금 불러올 수 없습니다. 잠시 후 다시 시도해주세요.' }, { status: 503 })
    revalidatePath('/')
    revalidatePath('/tft')
    return NextResponse.json({ ok: true, syncedAt: result.syncedAt, count: result.count })
  } catch (e) {
    const message = e instanceof Error ? e.message : '오류 발생'
    console.error('[tft] manual patch note sync 실패', message)
    return NextResponse.json({ error: '패치 노트를 갱신하지 못했습니다.' }, { status: 502 })
  }
}
