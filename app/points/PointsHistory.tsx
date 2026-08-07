'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ALERT } from '@/lib/ui/styles'

type Row = { id: number; amount: number; description: string | null; reason: string; created_at: string; balance_after: number }

function formatWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ko-KR', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(iso))
  } catch {
    return ''
  }
}

export default function PointsHistory() {
  const [state, setState] = useState<'loading' | 'ok' | 'unauth'>('loading')
  const [balance, setBalance] = useState(0)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    let mounted = true
    fetch('/api/me/points?limit=200', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: unknown) => {
        if (!mounted) return
        const data = d as { balance?: unknown; ledger?: unknown } | null
        if (!data || typeof data.balance !== 'number') {
          setState('unauth')
          return
        }
        setBalance(data.balance)
        setRows(Array.isArray(data.ledger) ? (data.ledger as Row[]) : [])
        setState('ok')
      })
      .catch(() => {
        if (mounted) setState('unauth')
      })
    return () => {
      mounted = false
    }
  }, [])

  if (state === 'loading') return <div className="text-sm text-muted">불러오는 중…</div>
  if (state === 'unauth') return <div className={ALERT.warn}>로그인한 승인 멤버만 볼 수 있어요. <Link href="/login" className="font-bold underline">로그인</Link></div>

  return (
    <div className="grid gap-5">
      <section className="flex items-center justify-between rounded-3xl bg-surface ring-1 ring-line p-5">
        <div>
          <div className="text-xs text-muted">보유 포인트</div>
          <div className="mt-0.5 text-2xl font-black text-brand-ink">{balance.toLocaleString()}P</div>
        </div>
        <Link href="/shop" className="rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm font-bold text-fg transition hover:bg-surface">상점 가기</Link>
      </section>

      <section className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-faint">아직 포인트 내역이 없어요.</div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-fg">{r.description ?? '포인트 변동'}</div>
                  <div className="text-[11px] text-faint">{formatWhen(r.created_at)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`text-sm font-black ${r.amount > 0 ? 'text-ok-ink' : 'text-danger-ink'}`}>{r.amount > 0 ? '+' : ''}{r.amount.toLocaleString()}P</div>
                  <div className="text-[11px] text-subtle">잔액 {r.balance_after.toLocaleString()}P</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
