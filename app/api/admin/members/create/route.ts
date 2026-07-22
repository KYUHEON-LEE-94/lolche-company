import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import { parseMemberInput } from '@/lib/members/memberInput'

export async function POST(req: Request) {
    const { ok, user, supabase } = await requireAdmin()

    if (!ok) return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })

    const body = await req.json().catch(() => null)
    const parsed = parseMemberInput(body)
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 })
    }

    const { data, error } = await supabase
        .schema('public')
        .from('members')
        .insert({
            ...parsed.value,
            // 관리자가 직접 등록한 멤버는 심사 없이 즉시 승인 상태다.
            status: 'approved',
            approved_at: new Date().toISOString(),
            approved_by: user.id,
        })
        .select('id')
        .single()

    if (error || !data) {
        return NextResponse.json({ ok: false, message: error?.message ?? 'insert failed' }, { status: 400 })
    }

    // 랭킹/관리자 목록 갱신
    revalidatePath('/')
    revalidatePath('/admin/members/control')

    return NextResponse.json({ ok: true, memberId: data.id })
}
