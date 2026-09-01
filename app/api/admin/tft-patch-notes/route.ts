import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/app/lib/isAdmin'
import { isMissingColumnError, isMissingTableError } from '@/lib/db/pgErrors'

export const dynamic = 'force-dynamic'
const NO_STORE = { 'Cache-Control': 'private, no-store' }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: NO_STORE }) }
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
