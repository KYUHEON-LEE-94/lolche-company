import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { UUID_RE, isRecord } from '@/lib/calendar/events'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'

// 랭킹 카드 배경(ranking_card_effects)의 가격·라벨·정렬·노출을 수정한다.
// CSS 효과(effect_key)와 이미지 배경(image_path) 모두 id 기준으로 처리한다.
// (이미지 배경은 effect_key 가 null 이라 예전처럼 effect_key 로 매칭하면 안 됨)
const ALLOWED = ['id', 'label', 'description', 'price_points', 'is_active', 'is_purchasable', 'sort_order', 'effect_key', 'image_path']

export async function PATCH(req: Request) {
  const admin = await requireAdmin()
  if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403 })
  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 }) }
  if (
    !isRecord(body) ||
    Object.keys(body).some((key) => !ALLOWED.includes(key)) ||
    typeof body.id !== 'string' || !UUID_RE.test(body.id) ||
    typeof body.label !== 'string' || !body.label.trim() || body.label.length > 50 ||
    !Number.isInteger(body.price_points) || Number(body.price_points) < 0 || Number(body.price_points) > 100000 ||
    typeof body.is_active !== 'boolean' ||
    typeof body.is_purchasable !== 'boolean' ||
    !Number.isInteger(body.sort_order)
  ) {
    return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  }
  // description 은 넘어온 경우에만 갱신(이미지 배경은 보통 null 유지)
  const patch: Record<string, unknown> = {
    label: body.label.trim(),
    price_points: Number(body.price_points),
    is_active: body.is_active,
    is_purchasable: body.is_purchasable,
    sort_order: Number(body.sort_order),
  }
  if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 200)
  const { error } = await supabaseAdmin.from('ranking_card_effects').update(patch).eq('id', body.id)
  return error ? NextResponse.json({ error: '수정하지 못했습니다.' }, { status: 500 }) : NextResponse.json({ ok: true })
}
