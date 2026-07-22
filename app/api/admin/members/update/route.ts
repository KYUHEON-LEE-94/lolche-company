import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import { parseMemberInput } from '@/lib/members/memberInput'

export async function POST(req: Request) {
    const { ok, supabase } = await requireAdmin()

    if (!ok) {
        return NextResponse.json(
            { ok: false, message: '관리자만 가능합니다.' },
            { status: 403 }
        )
    }

    const body = await req.json().catch(() => null)
    const id = String((body as { id?: unknown } | null)?.id ?? '').trim()

    if (!id) {
        return NextResponse.json({ ok: false, message: 'id가 필요합니다.' }, { status: 400 })
    }

    const parsed = parseMemberInput(body)
    if (!parsed.ok) {
        return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 })
    }

    // 관리자 수정은 status를 건드리지 않는다(승인 상태 유지).
    const { error } = await supabase
        .schema('public')
        .from('members')
        .update(parsed.value)
        .eq('id', id)

    if (error) {
        return NextResponse.json(
            { ok: false, message: error.message ?? 'update failed' },
            { status: 400 }
        )
    }

    revalidatePath('/')
    revalidatePath('/admin/members/control')

    return NextResponse.json({ ok: true })
}
