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
    // rank_effect 는 CSS 키·이미지 두 미러를 항상 함께 비운다(한쪽 잔류 방지).
    const update = body.itemType === 'frame' ? { profile_frame_path: null } : { ranking_card_effect_key: null, ranking_card_bg_image: null }
    const { error } = await supabaseAdmin.from('members').update(update).eq('id', mine.member.id)
    if (error) {
      if (body.itemType === 'rank_effect' && isMissingColumnError(error)) {
        const retry = await supabaseAdmin.from('members').update({ ranking_card_effect_key: null }).eq('id', mine.member.id)
        if (!retry.error) { invalidate(); return NextResponse.json({ ok: true }) }
      }
      return NextResponse.json({ error: '해제하지 못했습니다.' }, { status: 500 })
    }
    invalidate(); return NextResponse.json({ ok: true })
  }
  const admin = (await requireAdmin()).ok
  const table = body.itemType === 'frame' ? 'profile_frames' : 'ranking_card_effects'
  const inventory = body.itemType === 'frame' ? 'member_frame_inventory' : 'member_rank_effect_inventory'
  const idColumn = body.itemType === 'frame' ? 'frame_id' : 'effect_id'
  const selectColumns = body.itemType === 'frame' ? 'id,image_path,price_points' : 'id,effect_key,image_path,price_points'
  const itemResult = await supabaseAdmin.from(table).select(selectColumns).eq('id', body.itemId).eq('is_active', true).maybeSingle()
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
  // rank_effect 는 CSS 키·이미지 두 미러를 항상 함께 set(한쪽 null) — 재장착 시 이전 값 잔류 방지.
  const update = body.itemType === 'frame'
    ? { profile_frame_path: itemRecord.image_path }
    : { ranking_card_effect_key: itemRecord.effect_key ?? null, ranking_card_bg_image: itemRecord.image_path ?? null }
  const { error } = await supabaseAdmin.from('members').update(update).eq('id', mine.member.id)
  if (error) {
    // 이미지 배경 컬럼 미적용 환경: CSS 효과 장착이면 effect_key 만으로 1회 재시도한다.
    if (body.itemType === 'rank_effect' && isMissingColumnError(error) && !itemRecord.image_path) {
      const retry = await supabaseAdmin.from('members').update({ ranking_card_effect_key: itemRecord.effect_key ?? null }).eq('id', mine.member.id)
      if (!retry.error) { invalidate(); return NextResponse.json({ ok: true }) }
    }
    if (isMissingColumnError(error) || isMissingTableError(error)) return NextResponse.json({ error: '포인트 상점 준비 중입니다.', migration_required: true }, { status: 503 })
    return NextResponse.json({ error: '장착하지 못했습니다.' }, { status: 500 })
  }
  invalidate(); return NextResponse.json({ ok: true })
}
function invalidate() { revalidatePath('/'); revalidatePath('/profile'); revalidatePath('/tft'); revalidatePath('/lol') }
