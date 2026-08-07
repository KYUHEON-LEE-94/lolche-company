import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { UUID_RE } from '@/lib/calendar/events'

export async function POST(req: Request) {
    const { ok, supabase } = await requireAdmin()
    if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

    const body: unknown = await req.json().catch(() => null)
    const id = body && typeof body === 'object' && 'id' in body ? (body as { id?: unknown }).id : null
    if (typeof id !== 'string' || !UUID_RE.test(id)) {
        return NextResponse.json({ ok: false, message: '유효한 id가 필요합니다.' }, { status: 400 })
    }

    const { data: effect, error: effectError } = await supabaseAdmin.from('ranking_card_effects').select('image_path').eq('id', id).maybeSingle()
    if (effectError) return NextResponse.json({ ok: false, message: '배경 조회에 실패했습니다.' }, { status: 500 })
    if (!effect) return NextResponse.json({ ok: false, message: '배경을 찾을 수 없습니다.' }, { status: 404 })
    if (!effect.image_path) return NextResponse.json({ ok: false, message: '이미지 배경만 삭제할 수 있습니다.' }, { status: 400 })

    const [ownedResult, equippedResult] = await Promise.all([
        supabaseAdmin.from('member_rank_effect_inventory').select('member_id', { count: 'exact', head: true }).eq('effect_id', id),
        supabaseAdmin.from('members').select('id', { count: 'exact', head: true }).eq('ranking_card_bg_image', effect.image_path),
    ])
    if (ownedResult.error || equippedResult.error) return NextResponse.json({ ok: false, message: '배경 사용 여부를 확인하지 못했습니다.' }, { status: 500 })
    if ((ownedResult.count ?? 0) > 0 || (equippedResult.count ?? 0) > 0) {
        const { error: deactivateError } = await supabaseAdmin.from('ranking_card_effects').update({ is_active: false, is_purchasable: false }).eq('id', id)
        if (deactivateError) return NextResponse.json({ ok: false, message: '배경 비활성화에 실패했습니다.' }, { status: 500 })
        revalidatePath('/profile'); revalidatePath('/tft'); revalidatePath('/lol'); revalidatePath('/'); revalidatePath('/admin/profile-frames'); revalidatePath('/shop')
        return NextResponse.json({ ok: true, deactivated: true })
    }

    const { error: delErr } = await supabaseAdmin.from('ranking_card_effects').delete().eq('id', id)
    if (delErr) return NextResponse.json({ ok: false, message: delErr.message }, { status: 400 })

    const { error: rmErr } = effect.image_path.startsWith('/') ? { error: null } : await supabase.storage.from('rank-backgrounds').remove([effect.image_path])
    if (rmErr) return NextResponse.json({ ok: false, message: rmErr.message }, { status: 400 })

    revalidatePath('/')
    revalidatePath('/profile')
    revalidatePath('/tft')
    revalidatePath('/lol')
    revalidatePath('/admin/profile-frames')
    revalidatePath('/shop')

    return NextResponse.json({ ok: true })
}
