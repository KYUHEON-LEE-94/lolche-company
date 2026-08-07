import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { UUID_RE, isRecord } from '@/lib/calendar/events'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

// 기존 프레임의 가격·노출·정렬·라벨을 관리 페이지에서 편집한다(랭킹 효과 PATCH와 대칭).
// 이미지/키 변경은 업로드·삭제로 처리하므로 여기서 다루지 않는다.
const ALLOWED = ['id', 'label', 'price_points', 'is_purchasable', 'is_active', 'sort_order']

export async function PATCH(req: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 }) }
  if (
    !isRecord(body) ||
    Object.keys(body).some((k) => !ALLOWED.includes(k)) ||
    typeof body.id !== 'string' || !UUID_RE.test(body.id) ||
    typeof body.label !== 'string' || !body.label.trim() || body.label.length > 50 ||
    !Number.isInteger(body.price_points) || Number(body.price_points) < 0 || Number(body.price_points) > 100000 ||
    typeof body.is_purchasable !== 'boolean' ||
    typeof body.is_active !== 'boolean' ||
    !Number.isInteger(body.sort_order)
  ) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }
  const { error } = await supabaseAdmin
    .from('profile_frames')
    .update({
      label: body.label.trim(),
      price_points: Number(body.price_points),
      is_purchasable: body.is_purchasable,
      is_active: body.is_active,
      sort_order: Number(body.sort_order),
    })
    .eq('id', body.id)
  return error
    ? NextResponse.json({ error: '수정하지 못했습니다.' }, { status: 500 })
    : NextResponse.json({ ok: true })
}
