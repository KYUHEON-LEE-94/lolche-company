import 'server-only'

import { isMissingColumnError, isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseService } from '@/lib/supabase/service'

export type PublicTftPatchNote = {
  id: string
  title: string
  summary: string
  content: string
  publishedAt: string
  sourceUrl: string | null
  sourcePublishedAt: string | null
}

export async function getTftPatchNotesLastSyncedAt(): Promise<string | null> {
  const { data, error } = await supabaseService
    .from('tft_patch_note_sync_state')
    .select('last_success_at')
    .eq('id', true)
    .maybeSingle()
  if (error) {
    if (!isMissingTableError(error)) console.error('[tft] patch note sync state 조회 실패', error.message)
    return null
  }
  return data?.last_success_at ?? null
}

export async function getCurrentSeasonPatchNotes(seasonId: number | null): Promise<PublicTftPatchNote[]> {
  if (!seasonId) return []
  const { data, error } = await supabaseService
    .from('tft_patch_notes')
    .select('id,title,summary,content,published_at,created_at,source_url,source_published_at')
    .eq('season_id', seasonId)
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    if (isMissingColumnError(error)) return getLegacyCurrentSeasonPatchNotes(seasonId)
    if (!isMissingTableError(error)) console.error('[tft] patch notes 조회 실패', error.message)
    return []
  }
  return (data ?? []).map((note) => ({
    id: note.id,
    title: note.title,
    summary: note.summary,
    content: note.content,
    publishedAt: note.published_at ?? note.created_at,
    sourceUrl: note.source_url,
    sourcePublishedAt: note.source_published_at,
  }))
}

async function getLegacyCurrentSeasonPatchNotes(seasonId: number): Promise<PublicTftPatchNote[]> {
  const { data, error } = await supabaseService
    .from('tft_patch_notes')
    .select('id,title,summary,content,published_at,created_at')
    .eq('season_id', seasonId)
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(3)
  if (error) return []
  return (data ?? []).map((note) => ({
    id: note.id, title: note.title, summary: note.summary, content: note.content,
    publishedAt: note.published_at ?? note.created_at, sourceUrl: null, sourcePublishedAt: null,
  }))
}
