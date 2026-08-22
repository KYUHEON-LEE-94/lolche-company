import 'server-only'

import { isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseService } from '@/lib/supabase/service'

export type PublicTftPatchNote = { id: string; title: string; summary: string; content: string; publishedAt: string }

export async function getCurrentSeasonPatchNotes(seasonId: number | null): Promise<PublicTftPatchNote[]> {
  if (!seasonId) return []
  const { data, error } = await supabaseService
    .from('tft_patch_notes')
    .select('id,title,summary,content,published_at,created_at')
    .eq('season_id', seasonId)
    .eq('is_published', true)
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })

  if (error) {
    if (!isMissingTableError(error)) console.error('[tft] patch notes 조회 실패', error.message)
    return []
  }
  return (data ?? []).map((note) => ({
    id: note.id,
    title: note.title,
    summary: note.summary,
    content: note.content,
    publishedAt: note.published_at ?? note.created_at,
  }))
}
