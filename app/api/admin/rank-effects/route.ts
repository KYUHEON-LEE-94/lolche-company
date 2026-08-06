import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { RANK_EFFECT_KEYS } from '@/lib/cosmetics/rankEffects'
import { UUID_RE, isRecord } from '@/lib/calendar/events'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'
export async function PATCH(req: Request) {
  const admin = await requireAdmin(); if (!admin.ok) return NextResponse.json({ error: '관리자만 가능합니다.' }, { status: 403 })
  let body: unknown; try { body = await req.json() } catch (e) { return NextResponse.json({ error: e instanceof Error ? '요청 형식 오류' : '오류 발생' }, { status: 400 }) }
  if (!isRecord(body) || Object.keys(body).some((key) => !['id','effect_key','label','description','price_points','is_active','is_purchasable','sort_order'].includes(key)) || typeof body.id !== 'string' || !UUID_RE.test(body.id) || typeof body.effect_key !== 'string' || !(RANK_EFFECT_KEYS as readonly string[]).includes(body.effect_key) || typeof body.label !== 'string' || !body.label.trim() || body.label.length > 50 || !Number.isInteger(body.price_points) || Number(body.price_points) < 0 || Number(body.price_points) > 100000 || typeof body.is_active !== 'boolean' || typeof body.is_purchasable !== 'boolean' || !Number.isInteger(body.sort_order)) return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('ranking_card_effects').update({ label: body.label.trim(), description: typeof body.description === 'string' ? body.description.trim().slice(0, 200) : null, price_points: Number(body.price_points), is_active: body.is_active, is_purchasable: body.is_purchasable, sort_order: Number(body.sort_order) }).eq('id', body.id).eq('effect_key', body.effect_key)
  return error ? NextResponse.json({ error: '수정하지 못했습니다.' }, { status: 500 }) : NextResponse.json({ ok: true })
}
