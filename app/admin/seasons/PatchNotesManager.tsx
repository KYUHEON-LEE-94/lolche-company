'use client'

import { useEffect, useState } from 'react'
type Note = { id: string; title: string; is_published: boolean; source_key?: string | null; source_url?: string | null }

export default function PatchNotesManager({ season }: { season: { id: number; season_name: string } | undefined }) {
  const [notes, setNotes] = useState<Note[]>([])
  const load = async () => { if (!season) return; const res = await fetch(`/api/admin/tft-patch-notes?seasonId=${season.id}`, { cache: 'no-store' }); const body: unknown = await res.json().catch(() => null); if (body && typeof body === 'object' && Array.isArray((body as { notes?: unknown }).notes)) setNotes((body as { notes: Note[] }).notes) }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  // season id changes are the only source that requires a reload.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season?.id])
  const remove = async (id: string) => { if (!window.confirm('패치 노트를 삭제할까요?')) return; await fetch(`/api/admin/tft-patch-notes?id=${id}`, { method: 'DELETE' }); await load() }
  return <section className="rounded-2xl border border-line bg-surface p-6"><h2 className="text-lg font-black text-fg">현재 시즌 패치 노트</h2><p className="mt-1 text-sm text-subtle">{season ? '라이엇 공식 패치 노트가 자동으로 게시됩니다. 과거 수동 게시글은 여기서 삭제만 할 수 있습니다.' : '활성 시즌이 없어 표시할 패치 노트가 없습니다.'}</p>{season && <ul className="mt-6 divide-y divide-line">{notes.map((note) => <li key={note.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-bold text-fg">{note.title}</p><p className="text-xs text-subtle">{note.source_key ? '공식 자동 동기화' : note.is_published ? '공개' : '초안'}</p></div>{note.source_key ? <a href={note.source_url ?? undefined} target="_blank" rel="noreferrer" className="text-sm text-brand-ink">공식 링크</a> : <button type="button" onClick={() => void remove(note.id)} className="text-sm text-danger-ink">삭제</button>}</li>)}</ul>}</section>
}
