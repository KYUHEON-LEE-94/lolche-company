import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
    const { ok, supabase } = await requireAdmin()

    if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const member_name = String(body?.member_name ?? '').trim()
    const riot_game_name = String(body?.riot_game_name ?? '').trim()
    const riot_tagline = String(body?.riot_tagline ?? '').trim()

    if (!member_name || !riot_game_name || !riot_tagline) {
        return NextResponse.json({ ok: false, message: 'member_name/riot_game_name/riot_tagline 필요' }, { status: 400 })
    }

    const { data, error } = await supabase
        .schema('public')
        .from('members')
        .insert({ member_name, riot_game_name, riot_tagline })
        .select('id')
        .single()

    if (error || !data) {
        return NextResponse.json({ ok: false, message: error?.message ?? 'insert failed' }, { status: 400 })
    }

    // 랭킹/관리자 목록 갱신
    revalidatePath('/')
    revalidatePath('/admin/members')

    return NextResponse.json({ ok: true, memberId: data.id })
}
