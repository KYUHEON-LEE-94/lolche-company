'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type PendingMember = {
  id: string
  memberName: string
  requestedAt: string
}

type PendingResponse = {
  ok: true
  pendingCount: number
  recent: PendingMember[]
}

function isPendingResponse(value: unknown): value is PendingResponse {
  if (!value || typeof value !== 'object') return false

  const response = value as Record<string, unknown>
  if (response.ok !== true || typeof response.pendingCount !== 'number' || !Array.isArray(response.recent)) {
    return false
  }

  return response.recent.every((member) => {
    if (!member || typeof member !== 'object') return false
    const item = member as Record<string, unknown>
    return (
      typeof item.id === 'string' &&
      typeof item.memberName === 'string' &&
      typeof item.requestedAt === 'string'
    )
  })
}

function formatRequestedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  }).format(date)
}

export default function AdminPendingNotice() {
  const [pending, setPending] = useState<PendingResponse | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadPendingMembers() {
      try {
        const response = await fetch('/api/admin/pending-members', {
          cache: 'no-store',
          signal: controller.signal,
        })

        if (!response.ok || response.status === 204) return

        const body: unknown = await response.json()
        if (isPendingResponse(body) && body.pendingCount > 0) {
          setPending(body)
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
      }
    }

    void loadPendingMembers()
    return () => controller.abort()
  }, [])

  if (!pending) return null

  return (
    <aside className="mb-6 overflow-hidden rounded-2xl border border-warn/30 bg-warn/10 shadow-[0_16px_40px_-30px_var(--color-shadow)]">
      <div className="flex min-w-0 flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-warn-ink">Admin action</p>
          <p className="mt-1 text-base font-black tracking-tight text-fg">
            승인 대기 요청이 {pending.pendingCount}건 있어요
          </p>
          {pending.recent.length > 0 && (
            <ul className="mt-2 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
              {pending.recent.map((member) => (
                <li key={member.id} className="min-w-0 max-w-full">
                  <span className="break-words font-bold text-fg">{member.memberName}</span>
                  {formatRequestedAt(member.requestedAt) && (
                    <span className="ml-1 whitespace-nowrap text-subtle">
                      {formatRequestedAt(member.requestedAt)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <Link
          href="/admin/members/control"
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl border border-warn/30 bg-warn/15 px-4 py-2.5 text-sm font-black text-warn-ink transition-colors hover:bg-warn/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-warn/40 sm:w-auto"
        >
          승인 요청 확인
        </Link>
      </div>
    </aside>
  )
}
