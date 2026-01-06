import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import type { TablesInsert } from '@/types/supabase'

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
    const objectPath = `${key}.${ext}`

    const row: TablesInsert<'profile_frames'> = {
        key,
        label,
        image_path: objectPath,
        sort_order: sortOrder,
        created_by: user.id,
    }

    const { error: upErr } = await supabase.storage
        .from('profile-frames')
        .upload(objectPath, file, { upsert: true, contentType: file.type })
    if (upErr) return NextResponse.json({ ok: false, message: upErr.message }, { status: 400 })

    const { error: insErr } = await supabase.schema('public').from('profile_frames').insert({
        row
    })
    if (insErr) return NextResponse.json({ ok: false, message: insErr.message }, { status: 400 })

    // ✅ 캐시 무효화
    revalidatePath('/profile')
    revalidatePath('/admin/profile-frames')
    revalidatePath('/') // 랭킹 홈

    return NextResponse.json({ ok: true, image_path: objectPath })
}
