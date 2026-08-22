'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import EmptyState from '@/app/components/ui/EmptyState'
import type { PublicTftPatchNote } from '@/lib/tft/patchNotes'

function formatPublishedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' }).format(date)
}

function formatRetryAfter(seconds: number) {
  const minutes = Math.ceil(seconds / 60)
  return minutes > 1 ? `${minutes}분 후` : '잠시 후'
}

type RefreshResponse = { error?: unknown; retryAfterSeconds?: unknown }

export default function TftPatchNotes({ notes, lastSyncedAt }: { notes: PublicTftPatchNote[]; lastSyncedAt: string | null }) {
  const router = useRouter()
  const [openId, setOpenId] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshMessage, setRefreshMessage] = useState('')

  const refresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    setRefreshMessage('')
    try {
      const response = await fetch('/api/tft/patch-notes/refresh', { method: 'POST' })
      const body: unknown = await response.json().catch(() => null)
      const detail = body && typeof body === 'object' ? body as RefreshResponse : {}
      if (response.ok) {
        setRefreshMessage('최신 공식 패치 노트를 확인했습니다.')
        router.refresh()
      } else if (response.status === 429 || response.status === 409) {
        const seconds = typeof detail.retryAfterSeconds === 'number' && detail.retryAfterSeconds > 0 ? detail.retryAfterSeconds : 60
        setRefreshMessage(`${formatRetryAfter(seconds)} 다시 시도할 수 있습니다.`)
      } else {
        setRefreshMessage(typeof detail.error === 'string' ? detail.error : '패치 노트를 갱신하지 못했습니다.')
      }
    } catch (e) {
      console.error('[tft] patch note refresh failed', e instanceof Error ? e.message : '오류 발생')
      setRefreshMessage('패치 노트를 갱신하지 못했습니다.')
    } finally {
      setIsRefreshing(false)
    }
  }

  return <section className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="text-xs text-subtle">{lastSyncedAt ? `공식 목록 확인: ${formatPublishedAt(lastSyncedAt)}` : '공식 목록은 하루 한 번 자동 확인됩니다.'}</p>
      <button type="button" onClick={() => void refresh()} disabled={isRefreshing} className="rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:cursor-not-allowed disabled:opacity-60">
        {isRefreshing ? '확인 중…' : '최신 패치 확인'}
      </button>
      {refreshMessage && <p className="w-full text-xs text-brand-ink" role="status">{refreshMessage}</p>}
    </div>
    {!notes.length ? <EmptyState>현재 시즌의 패치 노트가 아직 없습니다.</EmptyState> : notes.map((note) => {
      const isOpen = openId === note.id
      const isOfficial = Boolean(note.sourceUrl)
      return <article key={note.id} className="rounded-2xl border border-line bg-surface p-5 shadow-[0_14px_38px_-28px_var(--color-shadow)]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0"><h2 className="text-base font-black text-fg">{note.title}</h2><p className="mt-1 text-xs text-subtle">{formatPublishedAt(note.sourcePublishedAt ?? note.publishedAt)}</p></div>
          {!isOfficial && <button type="button" onClick={() => setOpenId(isOpen ? null : note.id)} aria-expanded={isOpen} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs font-bold text-muted hover:bg-surface-2 hover:text-fg">{isOpen ? '접기' : '내용 보기'}</button>}
        </div>
        {note.summary && <p className="mt-4 text-sm leading-6 text-muted">{note.summary}</p>}
        {isOfficial && note.sourceUrl && <a href={note.sourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex rounded-lg border border-brand/35 px-3 py-1.5 text-xs font-bold text-brand-ink hover:bg-brand/10">공식 패치 노트 열기</a>}
        {!isOfficial && isOpen && <p className="mt-4 border-t border-line pt-4 whitespace-pre-wrap text-sm leading-7 text-fg">{note.content}</p>}
      </article>
    })}
  </section>
}
