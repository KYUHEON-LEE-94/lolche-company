import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'

export async function POST(req: Request) {
    const { ok, supabase } = await requireAdmin()
    if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

    const { id, image_path } = await req.json().catch(() => ({}))
    if (!id || !image_path) {
        return NextResponse.json({ ok: false, message: 'id/image_path 필요' }, { status: 400 })
    }

    // 1) DB 삭제
    const { error: delErr } = await supabase.from('profile_frames').delete().eq('id', id)
    if (delErr) return NextResponse.json({ ok: false, message: delErr.message }, { status: 400 })

    // 2) Storage 삭제
    const { error: rmErr } = await supabase.storage.from('profile-frames').remove([image_path])
    if (rmErr) return NextResponse.json({ ok: false, message: rmErr.message }, { status: 400 })

    return NextResponse.json({ ok: true })
}
