import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
    // 1. 관리자 권한 체크
    const { ok, supabase } = await requireAdmin()

    if (!ok) {
        return NextResponse.json(
            { ok: false, message: '관리자만 가능합니다.' },
            { status: 403 }
        )
    }

    // 2. 바디 데이터 추출 및 정제
    const body = await req.json().catch(() => null)
    const id = body?.id // 수정할 멤버의 고유 ID
    const member_name = String(body?.member_name ?? '').trim()
    const riot_game_name = String(body?.riot_game_name ?? '').trim()
    const riot_tagline = String(body?.riot_tagline ?? '').trim()

    // 3. 유효성 검사 (ID 포함)
    if (!id || !member_name || !riot_game_name || !riot_tagline) {
        return NextResponse.json(
            { ok: false, message: 'id/member_name/riot_game_name/riot_tagline이 모두 필요합니다.' },
            { status: 400 }
        )
    }

    // 4. 데이터베이스 업데이트 실행
    const { error } = await supabase
        .schema('public')
        .from('members')
        .update({
            member_name,
            riot_game_name,
            riot_tagline,
            // 수정 시에는 보통 last_synced_at을 초기화하지 않지만,
            // 닉네임이 바뀌면 새로 동기화해야 하므로 클라이언트에서 sync API를 호출하는 것이 좋습니다.
        })
        .eq('id', id)

    if (error) {
        return NextResponse.json(
            { ok: false, message: error.message ?? 'update failed' },
            { status: 400 }
        )
    }

    // 5. 캐시 갱신 (변경 사항 즉시 반영)
    revalidatePath('/')
    revalidatePath('/admin/members')

    return NextResponse.json({ ok: true })
}