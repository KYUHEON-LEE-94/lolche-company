import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'

export async function POST(req: Request) {
    const { ok, supabase, user } = await requireAdmin()
    if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    const key = String(form.get('key') ?? '')
    const label = String(form.get('label') ?? '')
    const sortOrder = Number(form.get('sort_order') ?? 0)

    if (!file || !key || !label) {
        return NextResponse.json({ ok: false, message: 'file/key/label이 필요합니다.' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const objectPath = `${key}.${ext}` // 예: pengu_gold.png

    // 1) Storage 업로드 (관리자만 가능 - RLS 정책)
    const { error: upErr } = await supabase.storage
        .from('profile-frames')
        .upload(objectPath, file, { upsert: true, contentType: file.type })

    if (upErr) return NextResponse.json({ ok: false, message: upErr.message }, { status: 400 })

    // 2) DB row insert
    const { error: insErr } = await supabase.from('profile_frames').insert({
        key,
        label,
        image_path: objectPath,
        sort_order: sortOrder,
        created_by: user.id,
    })

    if (insErr) return NextResponse.json({ ok: false, message: insErr.message }, { status: 400 })

    return NextResponse.json({ ok: true, image_path: objectPath })
}
