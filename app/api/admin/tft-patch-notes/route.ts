import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/app/lib/isAdmin'
import { isMissingColumnError, isMissingTableError } from '@/lib/db/pgErrors'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type NoteInput = { seasonId: number; title: string; summary: string; content: string; isPublished: boolean }

function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: NO_STORE }) }
function parseInput(value: unknown): NoteInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.some((key) => !['seasonId', 'title', 'summary', 'content', 'isPublished'].includes(key))) return null
  const { seasonId, title, summary, content, isPublished } = record
  if (!Number.isInteger(seasonId) || typeof title !== 'string' || typeof summary !== 'string' || typeof content !== 'string' || typeof isPublished !== 'boolean') return null
  const cleanTitle = title.trim(); const cleanSummary = summary.trim(); const cleanContent = content.trim()
  const parsedSeasonId = seasonId as number
  if (parsedSeasonId <= 0 || !cleanTitle || cleanTitle.length > 120 || cleanSummary.length > 300 || !cleanContent || cleanContent.length > 20000) return null
  return { seasonId: parsedSeasonId, title: cleanTitle, summary: cleanSummary, content: cleanContent, isPublished }
}
function missing(error: { code?: string | null } | null) { return isMissingTableError(error) || isMissingColumnError(error) ? response({ error: '패치 노트 마이그레이션이 필요합니다.', migration_required: true }, 503) : null }

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(); if (!admin.ok) return response({ error: '관리자 권한이 필요합니다.' }, 403)
  const seasonId = Number(request.nextUrl.searchParams.get('seasonId'))
  if (!Number.isInteger(seasonId) || seasonId <= 0) return response({ error: '올바른 시즌이 필요합니다.' }, 400)
  const { data: season } = await admin.supabase.from('seasons').select('id').eq('id', seasonId).eq('is_active', true).maybeSingle()
  if (!season) return response({ error: '현재 활성 시즌만 조회할 수 있습니다.' }, 400)
  const { data, error } = await admin.supabase.from('tft_patch_notes').select('id,season_id,title,summary,content,is_published,published_at,created_at,updated_at,source_key,source_url').eq('season_id', seasonId).order('created_at', { ascending: false })
  if (error) return missing(error) ?? response({ error: '패치 노트를 불러오지 못했습니다.' }, 500)
  return response({ notes: data ?? [] })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(); if (!admin.ok) return response({ error: '관리자 권한이 필요합니다.' }, 403)
  const input = parseInput(await request.json().catch(() => null)); if (!input) return response({ error: '입력값을 확인해주세요.' }, 400)
  const { data: season } = await admin.supabase.from('seasons').select('id').eq('id', input.seasonId).eq('is_active', true).maybeSingle()
  if (!season) return response({ error: '현재 활성 시즌에만 작성할 수 있습니다.' }, 400)
  const { data, error } = await admin.supabase.from('tft_patch_notes').insert({ season_id: input.seasonId, title: input.title, summary: input.summary, content: input.content, is_published: input.isPublished, published_at: input.isPublished ? new Date().toISOString() : null }).select('id,season_id,title,summary,content,is_published,published_at,created_at,updated_at').single()
  if (error) return missing(error) ?? response({ error: '패치 노트를 저장하지 못했습니다.' }, 500)
  revalidatePath('/tft'); revalidatePath('/admin/seasons'); return response({ note: data }, 201)
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin(); if (!admin.ok) return response({ error: '관리자 권한이 필요합니다.' }, 403)
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response({ error: '입력값을 확인해주세요.' }, 400)
  const record = body as Record<string, unknown>; const id = record.id; const input = parseInput(Object.fromEntries(Object.entries(record).filter(([key]) => key !== 'id')))
  if (typeof id !== 'string' || !UUID_RE.test(id) || !input) return response({ error: '입력값을 확인해주세요.' }, 400)
  const { data: existing, error: existingError } = await admin.supabase.from('tft_patch_notes').select('id,season_id,published_at,source_key').eq('id', id).maybeSingle()
  if (existingError) return missing(existingError) ?? response({ error: '패치 노트를 찾지 못했습니다.' }, 500)
  if (!existing) return response({ error: '패치 노트를 찾지 못했습니다.' }, 404)
  if (existing.source_key) return response({ error: '공식 동기화 패치 노트는 수정할 수 없습니다.' }, 409)
  if (existing.season_id !== input.seasonId) return response({ error: '현재 활성 시즌의 패치 노트만 수정할 수 있습니다.' }, 400)
  const { data: season } = await admin.supabase.from('seasons').select('id').eq('id', existing.season_id).eq('is_active', true).maybeSingle()
  if (!season) return response({ error: '현재 활성 시즌의 패치 노트만 수정할 수 있습니다.' }, 400)
  const { data, error } = await admin.supabase.from('tft_patch_notes').update({ title: input.title, summary: input.summary, content: input.content, is_published: input.isPublished, published_at: input.isPublished ? existing.published_at ?? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('id', id).select('id,season_id,title,summary,content,is_published,published_at,created_at,updated_at').single()
  if (error) return missing(error) ?? response({ error: '패치 노트를 수정하지 못했습니다.' }, 500)
  revalidatePath('/tft'); revalidatePath('/admin/seasons'); return response({ note: data })
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin(); if (!admin.ok) return response({ error: '관리자 권한이 필요합니다.' }, 403)
  const id = request.nextUrl.searchParams.get('id'); if (!id || !UUID_RE.test(id)) return response({ error: '올바른 패치 노트 ID가 필요합니다.' }, 400)
  const { data: existing, error: existingError } = await admin.supabase.from('tft_patch_notes').select('id,season_id,source_key').eq('id', id).maybeSingle()
  if (existingError) return missing(existingError) ?? response({ error: '패치 노트를 찾지 못했습니다.' }, 500)
  if (!existing) return response({ error: '패치 노트를 찾지 못했습니다.' }, 404)
  if (existing.source_key) return response({ error: '공식 동기화 패치 노트는 삭제할 수 없습니다.' }, 409)
  const { data: season } = await admin.supabase.from('seasons').select('id').eq('id', existing.season_id).eq('is_active', true).maybeSingle()
  if (!season) return response({ error: '현재 활성 시즌의 패치 노트만 삭제할 수 있습니다.' }, 400)
  const { error } = await admin.supabase.from('tft_patch_notes').delete().eq('id', id)
  if (error) return missing(error) ?? response({ error: '패치 노트를 삭제하지 못했습니다.' }, 500)
  revalidatePath('/tft'); revalidatePath('/admin/seasons'); return response({ ok: true })
}
