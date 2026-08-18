'use client'

import { useState } from 'react'
import { setSeasonScheduledEndAction } from '@/lib/actions/season-actions'

function isoToKstLocal(iso: string | null): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

/** 활성 시즌 예약 종료일 설정. 저장 시 크론이 며칠 전 디스코드로 '마감 임박'을 1회 알린다. */
export default function SeasonEndScheduler({ seasonId, initial }: { seasonId: number; initial: string | null }) {
  const [value, setValue] = useState(() => isoToKstLocal(initial))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function save(clear: boolean) {
    setSaving(true)
    setMsg(null)
    try {
      const iso = clear || !value ? null : new Date(`${value}:00+09:00`).toISOString()
      const res = await setSeasonScheduledEndAction(seasonId, iso)
      if (!res.ok) { setMsg(res.message ?? '저장 실패'); return }
      if (clear) setValue('')
      setMsg(clear ? '예약 해제됨' : '저장됐어요 ✅')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
      <div className="text-xs font-black text-muted">예약 종료일 (마감 임박 알림)</div>
      <p className="mt-0.5 text-[11px] text-subtle">설정하면 마감 며칠 전(기본 3일) 디스코드로 1회 알립니다.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-indigo-500/50 focus:outline-none"
        />
        <button disabled={saving || !value} onClick={() => save(false)} className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white transition hover:bg-indigo-500 disabled:opacity-40">저장</button>
        {initial && <button disabled={saving} onClick={() => save(true)} className="rounded-lg border border-line bg-surface px-3 py-2 text-xs font-bold text-muted transition hover:text-fg disabled:opacity-40">해제</button>}
        {msg && <span className="text-xs font-bold text-brand-ink">{msg}</span>}
      </div>
    </div>
  )
}
