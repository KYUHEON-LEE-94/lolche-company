'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { rolloverSeasonAction, type SeasonRolloverResult } from '@/lib/actions/season-actions'

type Props = {
  currentSeason: { id: number; season_name: string; set_number: number }
  onCompleted: () => Promise<void>
}

function toLocalDateTimeInput(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default function SeasonRolloverPanel({ currentSeason, onCompleted }: Props) {
  const [open, setOpen] = useState(false)
  const [nextSeasonName, setNextSeasonName] = useState('')
  const [nextSetNumber, setNextSetNumber] = useState('')
  const [startAt, setStartAt] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [finalSyncConfirmed, setFinalSyncConfirmed] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [result, setResult] = useState<SeasonRolloverResult | null>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef(pending)

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  useEffect(() => {
    if (!open) return
    const trigger = triggerRef.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    firstInputRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        event.preventDefault()
        setOpen(false)
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled])'))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      trigger?.focus()
    }
  }, [open])

  const openPanel = () => {
    setNextSeasonName(`TFT 시즌 ${currentSeason.set_number + 1}`)
    setNextSetNumber(String(currentSeason.set_number + 1))
    setStartAt(toLocalDateTimeInput())
    setConfirmation('')
    setFinalSyncConfirmed(false)
    setMessage(null)
    setResult(null)
    setOpen(true)
  }

  const canSubmit = !pending && finalSyncConfirmed
    && confirmation.trim() === currentSeason.season_name
    && nextSeasonName.trim().length > 0 && nextSetNumber.length > 0 && startAt.length > 0

  const submit = () => {
    if (!canSubmit) return
    if (!window.confirm('명예의 전당 저장과 시즌 전환을 실행할까요? 실행 중에는 창을 닫지 마세요.')) return

    setMessage(null)
    startTransition(async () => {
      const parsedStartAt = new Date(startAt)
      if (Number.isNaN(parsedStartAt.getTime())) {
        setMessage({ type: 'error', text: '다음 시즌 시작 시각이 올바르지 않습니다.' })
        return
      }
      const response = await rolloverSeasonAction({
        currentSeasonId: currentSeason.id,
        confirmation,
        nextSeasonName,
        nextSetNumber: Number(nextSetNumber),
        startAt: parsedStartAt.toISOString(),
        finalSyncConfirmed,
      })
      if (!response.ok) {
        setMessage({ type: 'error', text: response.message })
        return
      }
      setResult(response.result)
      setMessage({
        type: 'success',
        text: response.result.status === 'already_completed'
          ? '이미 완료된 전환입니다. 중복 생성 없이 기존 결과를 확인했습니다.'
          : '시즌 전환이 완료되었습니다.',
      })
      await onCompleted()
    })
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={openPanel} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-brand/20 transition-colors hover:bg-brand/90">
        시즌 전환
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={(event) => event.target === event.currentTarget && !pending && setOpen(false)}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="season-rollover-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-panel p-6 shadow-2xl sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-brand-ink">Atomic rollover</p>
                <h2 id="season-rollover-title" className="mt-1 text-xl font-black text-fg">시즌 마감 & 다음 시즌 시작</h2>
                <p className="mt-2 text-sm leading-6 text-muted">솔로·더블업 기록 저장, 현재 시즌 종료, 다음 시즌 시작을 하나의 트랜잭션으로 처리합니다.</p>
              </div>
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-lg p-2 text-subtle hover:bg-surface-2 hover:text-fg disabled:opacity-40" aria-label="닫기">✕</button>
            </div>

            <div className="mt-5 rounded-xl border border-warn/25 bg-warn/10 p-4 text-sm text-muted">
              <p className="font-black text-warn-ink">먼저 최종 랭크를 동기화하세요.</p>
              <p className="mt-1 leading-6">Riot API 동기화는 오래 걸릴 수 있어 DB 트랜잭션과 분리되어 있습니다.</p>
              <Link href="/admin/members/sync" className="mt-2 inline-flex font-bold text-brand-ink hover:underline">멤버 동기화 화면 열기 →</Link>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="space-y-1.5 sm:col-span-2">
                <span className="text-xs font-bold text-muted">다음 시즌 이름</span>
                <input ref={firstInputRef} value={nextSeasonName} onChange={(event) => setNextSeasonName(event.target.value)} maxLength={60} disabled={pending} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg outline-none focus:border-brand/60" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted">다음 세트 번호</span>
                <input type="number" min={1} max={999} value={nextSetNumber} onChange={(event) => setNextSetNumber(event.target.value)} disabled={pending} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg outline-none focus:border-brand/60" />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-bold text-muted">시작 시각</span>
                <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} disabled={pending} className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg outline-none focus:border-brand/60" />
              </label>
            </div>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-3">
              <input type="checkbox" checked={finalSyncConfirmed} onChange={(event) => setFinalSyncConfirmed(event.target.checked)} disabled={pending} className="mt-0.5 h-4 w-4 accent-indigo-600" />
              <span className="text-sm leading-5 text-muted">최종 랭크 동기화 상태를 확인했습니다.</span>
            </label>

            <label className="mt-4 block space-y-1.5">
              <span className="text-xs font-bold text-muted">확인을 위해 <strong className="text-fg">{currentSeason.season_name}</strong> 입력</span>
              <input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={pending} autoComplete="off" className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm font-medium text-fg outline-none focus:border-danger/60" />
            </label>

            {message && (
              <div role={message.type === 'success' ? 'status' : 'alert'} aria-live="polite" className={`mt-4 rounded-xl border p-3 text-sm font-bold ${message.type === 'success' ? 'border-ok/25 bg-ok/10 text-ok-ink' : 'border-danger/25 bg-danger/10 text-danger-ink'}`}>
                {message.text}
                {result && <p className="mt-1 font-medium">솔로 {result.solo_count}명 · 더블업 {result.doubleup_count}명 · {result.next_season_name}</p>}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm font-bold text-muted disabled:opacity-40">닫기</button>
              <button type="button" onClick={submit} disabled={!canSubmit} className="rounded-xl bg-danger px-4 py-2.5 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">
                {pending ? '전환 중…' : '명예의 전당 저장 후 전환'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
