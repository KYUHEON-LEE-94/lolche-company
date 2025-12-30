// app/api/profile/frame/route.ts
import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route' // 네 프로젝트 helper에 맞게
// 만약 createRouteClient 이름이 다르면 너가 쓰는 걸로 바꿔줘.

export async function POST(req: Request) {
    const supabase = await createRouteClient()

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const framePath = body?.framePath as string | null | undefined

    // framePath는 null(해제) 또는 "/frames/..." 만 허용 (가드)
    if (framePath !== null && framePath !== undefined) {
        if (typeof framePath !== 'string' || !framePath.startsWith('/frames/')) {
            return NextResponse.json({ ok: false, message: 'Invalid framePath' }, { status: 400 })
        }
    }

    const { error: updateError } = await supabase
        .from('members')
        .update({
            profile_frame_path: framePath ?? null,
            // profile_updated_at은 trigger로 자동 처리됨
        })
        .eq('user_id', user.id)

    if (updateError) {
        return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
