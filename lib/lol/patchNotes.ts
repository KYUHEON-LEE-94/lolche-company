import 'server-only'

import { isMissingTableError } from '@/lib/db/pgErrors'
import { supabaseService } from '@/lib/supabase/service'

export type PublicLolPatchNote = {
  id: string
  title: string
  summary: string
  publishedAt: string
  sourceUrl: string | null
}

/** 최근 롤 공식 패치 소식(전역, 시즌 무관). 테이블 미적용이면 빈 배열. */
export async function getLolPatchNotes(): Promise<PublicLolPatchNote[]> {
  const { data, error } = await supabaseService
    .from('lol_patch_notes')
    .select('id,title,summary,published_at,created_at,source_url')
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(3)

  if (error) {
    if (!isMissingTableError(error)) console.error('[lol] patch notes 조회 실패', error.message)
    return []
  }
  return (data ?? []).map((note) => ({
    id: note.id,
    title: note.title,
    summary: note.summary,
    publishedAt: note.published_at ?? note.created_at,
    sourceUrl: note.source_url,
  }))
}
