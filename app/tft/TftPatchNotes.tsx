'use client'

import { useState } from 'react'
import EmptyState from '@/app/components/ui/EmptyState'
import type { PublicTftPatchNote } from '@/lib/tft/patchNotes'

function formatPublishedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(date)
}

export default function TftPatchNotes({ notes }: { notes: PublicTftPatchNote[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  if (!notes.length) return <EmptyState>현재 시즌의 패치 노트가 아직 없습니다.</EmptyState>
  return <div className="space-y-3">
    {notes.map((note) => {
      const isOpen = openId === note.id
      return <article key={note.id} className="rounded-2xl border border-line bg-surface p-5 shadow-[0_14px_38px_-28px_var(--color-shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><h2 className="text-base font-black text-fg">{note.title}</h2><p className="mt-1 text-xs text-subtle">{formatPublishedAt(note.publishedAt)}</p></div>
          <button type="button" onClick={() => setOpenId(isOpen ? null : note.id)} aria-expanded={isOpen} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-muted hover:bg-surface-2 hover:text-fg">{isOpen ? '접기' : '내용 보기'}</button>
        </div>
        {note.summary && <p className="mt-4 text-sm leading-6 text-muted">{note.summary}</p>}
        {isOpen && <p className="mt-4 border-t border-line pt-4 whitespace-pre-wrap text-sm leading-7 text-fg">{note.content}</p>}
      </article>
    })}
  </div>
}
