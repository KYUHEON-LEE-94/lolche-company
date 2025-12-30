import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase/route'

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
    const imagePath = body?.imagePath as string | null | undefined

    // imagePath는 null(제거) 또는 "{uid}/..." 형태만 허용
    if (imagePath !== null && imagePath !== undefined) {
        if (typeof imagePath !== 'string' || !imagePath.startsWith(`${user.id}/`)) {
            return NextResponse.json({ ok: false, message: 'Invalid imagePath' }, { status: 400 })
        }
    }

    const { error: updateError } = await supabase
        .from('members')
        .update({ profile_image_path: imagePath ?? null })
        .eq('user_id', user.id)

    if (updateError) {
        return NextResponse.json({ ok: false, message: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}
