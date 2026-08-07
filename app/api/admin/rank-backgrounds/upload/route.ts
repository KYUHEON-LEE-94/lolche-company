import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import type { TablesInsert } from '@/types/supabase'

export async function POST(req: Request) {
    const { ok, supabase, user } = await requireAdmin()
    if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    const key = String(form.get('key') ?? '').trim()
    const label = String(form.get('label') ?? '').trim()
    const sortOrder = Number(form.get('sort_order') ?? 0)
    const pricePoints = Number(form.get('price_points') ?? 0)
    const isPurchasable = String(form.get('is_purchasable') ?? 'true') === 'true'

    if (!file || !/^[a-z0-9_-]{1,40}$/.test(key) || !label || label.length > 50 || !Number.isInteger(sortOrder) || !Number.isInteger(pricePoints) || pricePoints < 0 || pricePoints > 100000) {
        return NextResponse.json({ ok: false, message: 'file/key/label이 필요합니다.' }, { status: 400 })
    }

    const EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/gif': 'gif' }
    if (file.size > 5 * 1024 * 1024) return NextResponse.json({ ok: false, message: `이미지는 5MB 이하만 업로드할 수 있습니다. (현재 ${(file.size / 1024 / 1024).toFixed(1)}MB)` }, { status: 400 })
    if (!EXT[file.type]) return NextResponse.json({ ok: false, message: `PNG/WebP/JPG/GIF만 가능합니다. (현재 ${file.type || '알 수 없음'})` }, { status: 400 })
    const ext = EXT[file.type]
    const objectPath = `${key}.${ext}`

    const { data: duplicate, error: duplicateError } = await supabase.schema('public')
        .from('ranking_card_effects')
        .select('id')
        .or(`key.eq.${key},image_path.eq.${objectPath}`)
        .limit(1)
        .maybeSingle()
    if (duplicateError && !isMissingColumnError(duplicateError)) return NextResponse.json({ ok: false, message: '중복 확인에 실패했습니다.' }, { status: 500 })
    if (duplicateError && isMissingColumnError(duplicateError)) return NextResponse.json({ ok: false, message: '배경 기능이 아직 준비 중입니다.', migration_required: true }, { status: 503 })
    if (duplicate) return NextResponse.json({ ok: false, message: '이미 사용 중인 key 또는 파일 경로입니다.' }, { status: 409 })

    // 이미지 배경은 CSS 키가 없다 — effect_key:null + image_path 로 XOR CHECK 를 통과한다.
    const row: TablesInsert<'ranking_card_effects'> = {
        key,
        label,
        effect_key: null,
        image_path: objectPath,
        sort_order: sortOrder,
        created_by: user.id,
        price_points: pricePoints,
        is_purchasable: isPurchasable,
    }

    const { error: upErr } = await supabase.storage
        .from('rank-backgrounds')
        .upload(objectPath, file, { upsert: false, contentType: file.type })
    if (upErr) return NextResponse.json({ ok: false, message: upErr.message }, { status: 400 })

    const { error: insErr } = await supabase.schema('public').from('ranking_card_effects').insert(row)
    if (insErr) {
        await supabase.storage.from('rank-backgrounds').remove([objectPath])
        if (isMissingColumnError(insErr)) return NextResponse.json({ ok: false, message: '배경 기능이 아직 준비 중입니다.', migration_required: true }, { status: 503 })
        return NextResponse.json({ ok: false, message: insErr.message }, { status: 400 })
    }

    revalidatePath('/')
    revalidatePath('/profile')
    revalidatePath('/tft')
    revalidatePath('/lol')
    revalidatePath('/admin/profile-frames')
    revalidatePath('/shop')

    return NextResponse.json({ ok: true, image_path: objectPath })
}
