// app/api/profile/frame/route.ts
import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

export async function POST(req: Request) {
    const supabase = await createRouteClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
        return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    const framePath = body?.framePath as string | null | undefined

    // ✅ 1) null이면 해제 허용
    if (framePath === null || framePath === undefined) {
        const { error } = await supabase
            .from('members')
            .update({ profile_frame_path: null })
            .eq('user_id', user.id)

        if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
        return NextResponse.json({ ok: true })
    }

    // ✅ 2) string 검증
    if (typeof framePath !== 'string' || framePath.length > 300) {
        return NextResponse.json({ ok: false, message: 'Invalid framePath' }, { status: 400 })
    }

    // ✅ 3) DB에 등록된(active) 프레임만 허용
    const { data: frame, error: frameErr } = await supabase
        .from('profile_frames')
        .select('id')
        .eq('image_path', framePath)
        .eq('is_active', true)
        .maybeSingle()

    if (frameErr) {
        return NextResponse.json({ ok: false, message: frameErr.message }, { status: 500 })
    }
    if (!frame) {
        return NextResponse.json({ ok: false, message: 'Invalid framePath' }, { status: 400 })
    }

    // ✅ 4) members에 저장
    const { error: updateError } = await supabase
        .from('members')
        .update({ profile_frame_path: framePath })
        .eq('user_id', user.id)

    if (updateError) {
        return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
