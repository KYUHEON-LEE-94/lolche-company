import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getMyMember } from '@/lib/members/myMember'
import { requireAdmin } from '@/app/lib/isAdmin'
import { UUID_RE, isRecord } from '@/lib/calendar/events'
import { isMissingColumnError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'
export async function POST(req: Request) {
  const mine = await getMyMember()
  if (!mine.ok) return NextResponse.json({ error: mine.message }, { status: mine.status })
  if (!mine.member || mine.member.status !== 'approved') return NextResponse.json({ error: '승인된 멤버만 사용할 수 있습니다.' }, { status: 403 })
  let body: unknown
  try { body = await req.json() } catch (e) { return NextResponse.json({ error: e instanceof Error ? '요청 형식이 올바르지 않습니다.' : '오류 발생' }, { status: 400 }) }
  if (!isRecord(body) || Object.keys(body).some((key) => !['itemType','itemId'].includes(key)) || (body.itemType !== 'frame' && body.itemType !== 'rank_effect') || (body.itemId !== null && (typeof body.itemId !== 'string' || !UUID_RE.test(body.itemId)))) return NextResponse.json({ error: '장착 정보가 올바르지 않습니다.' }, { status: 400 })
  if (body.itemId === null) {
    const update = body.itemType === 'frame' ? { profile_frame_path: null } : { ranking_card_effect_key: null }
    const { error } = await supabaseAdmin.from('members').update(update).eq('id', mine.member.id)
    if (error) return NextResponse.json({ error: '해제하지 못했습니다.' }, { status: 500 })
    invalidate(); return NextResponse.json({ ok: true })
  }
  const admin = (await requireAdmin()).ok
  const table = body.itemType === 'frame' ? 'profile_frames' : 'ranking_card_effects'
  const inventory = body.itemType === 'frame' ? 'member_frame_inventory' : 'member_rank_effect_inventory'
  const idColumn = body.itemType === 'frame' ? 'frame_id' : 'effect_id'
  const valueColumn = body.itemType === 'frame' ? 'image_path' : 'effect_key'
  const itemResult = await supabaseAdmin.from(table).select(`id,${valueColumn},price_points`).eq('id', body.itemId).eq('is_active', true).maybeSingle()
  let itemRecord = itemResult.data as unknown as Record<string, unknown> | null
  if (itemResult.error && body.itemType === 'frame' && isMissingColumnError(itemResult.error)) {
    const legacy = await supabaseAdmin.from('profile_frames').select('id,image_path').eq('id', body.itemId).eq('is_active', true).maybeSingle()
    if (legacy.error) return NextResponse.json({ error: '활성 상품을 확인하지 못했습니다.' }, { status: 500 })
    itemRecord = legacy.data ? { ...legacy.data, price_points: 0 } : null
  } else if (itemResult.error) {
    if (isMissingColumnError(itemResult.error) || isMissingTableError(itemResult.error)) return NextResponse.json({ error: '포인트 상점 준비 중입니다.', migration_required: true }, { status: 503 })
    return NextResponse.json({ error: '활성 상품을 확인하지 못했습니다.' }, { status: 500 })
  }
  if (!itemRecord) return NextResponse.json({ error: '활성 상품을 찾을 수 없습니다.' }, { status: 404 })
  if (!admin && !(body.itemType === 'frame' && itemRecord.price_points === 0)) {
    const { data: owned, error } = await supabaseAdmin.from(inventory).select(idColumn).eq('member_id', mine.member.id).eq(idColumn, body.itemId).maybeSingle()
    if (error || !owned) return NextResponse.json({ error: '보유한 상품만 장착할 수 있습니다.' }, { status: 403 })
  }
  const update = body.itemType === 'frame' ? { profile_frame_path: itemRecord[valueColumn] } : { ranking_card_effect_key: itemRecord[valueColumn] }
  const { error } = await supabaseAdmin.from('members').update(update).eq('id', mine.member.id)
  if (error) {
    if (isMissingColumnError(error) || isMissingTableError(error)) return NextResponse.json({ error: '포인트 상점 준비 중입니다.', migration_required: true }, { status: 503 })
    return NextResponse.json({ error: '장착하지 못했습니다.' }, { status: 500 })
  }
  invalidate(); return NextResponse.json({ ok: true })
}
function invalidate() { revalidatePath('/'); revalidatePath('/profile'); revalidatePath('/tft'); revalidatePath('/lol') }
