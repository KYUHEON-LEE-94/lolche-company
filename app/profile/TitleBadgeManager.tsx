'use client'

import { useEffect, useState } from 'react'
import type { PublicTitleBadge, TitleView } from '@/lib/achievements/titles'

function equippedBadges(titles: TitleView[], selected: string[]): PublicTitleBadge[] {
  return selected.flatMap((id) => {
    const title = titles.find((item) => item.id === id)
    return title ? [{ id: title.id, label: title.label }] : []
  })
}

export default function TitleBadgeManager({
  onEquippedChange,
}: {
  onEquippedChange?: (titles: PublicTitleBadge[]) => void
}) {
  const [titles, setTitles] = useState<TitleView[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    void (async () => {
      const response = await fetch('/api/me/titles', { cache: 'no-store' })
      const data: unknown = await response.json().catch(() => null)
      if (!response.ok || !data || typeof data !== 'object') {
        setMessage('칭호를 불러오지 못했습니다.')
      } else {
        const result = data as { titles?: TitleView[]; migration_required?: boolean }
        const nextTitles = result.titles ?? []
        const nextSelected = nextTitles
          .filter((title) => title.equipped_slot !== null)
          .sort((a, b) => (a.equipped_slot ?? 0) - (b.equipped_slot ?? 0))
          .map((title) => title.id)
        if (result.migration_required) setMessage('업적 기능 준비 중입니다.')
        setTitles(nextTitles)
        setSelected(nextSelected)
        onEquippedChange?.(equippedBadges(nextTitles, nextSelected))
      }
      setLoading(false)
    })()
  }, [onEquippedChange])
  const available = titles.filter((title) => title.available)
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 3 ? [...current, id] : current) }
  function move(index: number, direction: -1 | 1) { const next = [...selected]; const target = index + direction; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; setSelected(next) }
  async function save() {
    const response = await fetch('/api/me/titles/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titleIds: selected }),
    })
    if (!response.ok) {
      setMessage('저장하지 못했습니다.')
      return
    }
    setTitles((current) => current.map((title) => ({
      ...title,
      equipped_slot: selected.indexOf(title.id) + 1 || null,
    })))
    onEquippedChange?.(equippedBadges(titles, selected))
    setMessage('칭호를 저장했어요.')
  }

  return (
    <section className="rounded-3xl bg-surface p-5 ring-1 ring-line sm:p-6">
      <div className="text-fg font-extrabold">업적 칭호</div>
      <p className="mt-1 text-xs text-muted">최대 3개를 골라 프로필과 랭킹 카드에 표시해요.</p>
      {loading ? <div className="mt-4 text-sm text-muted">불러오는 중...</div> : (
        <>
          <div className="mt-4 grid gap-2">
            {selected.length === 0 && <p className="rounded-xl bg-surface-2 px-3 py-3 text-xs text-muted">장착한 칭호가 없어요.</p>}
            {selected.map((id, index) => {
              const title = titles.find((item) => item.id === id)
              return title ? (
                <div key={id} className="flex items-center gap-2 rounded-xl bg-brand/10 px-3 py-2">
                  <span className="text-xs font-black text-brand-ink">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{title.label}</span>
                  <button type="button" aria-label={`${title.label} 앞으로`} onClick={() => move(index, -1)} disabled={index === 0} className="min-h-9 min-w-9 rounded-lg text-xs text-muted disabled:opacity-30">↑</button>
                  <button type="button" aria-label={`${title.label} 뒤로`} onClick={() => move(index, 1)} disabled={index === selected.length - 1} className="min-h-9 min-w-9 rounded-lg text-xs text-muted disabled:opacity-30">↓</button>
                  <button type="button" onClick={() => toggle(id)} className="min-h-9 rounded-lg px-2 text-xs font-bold text-muted">해제</button>
                </div>
              ) : null
            })}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {available.map((title) => (
              <button type="button" key={title.id} onClick={() => toggle(title.id)} aria-pressed={selected.includes(title.id)} className={`rounded-xl border p-3 text-left ${selected.includes(title.id) ? 'border-brand bg-brand/10' : 'border-line bg-surface-2'}`}>
                <div className="text-sm font-bold text-fg">{title.label}</div>
                <div className="mt-1 text-xs text-muted">{title.description}</div>
                <div className="mt-2 text-[11px] text-brand-ink">{title.kind === 'permanent' ? '보유 업적' : '현재 조건 충족'}</div>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void save()} className="mt-4 min-h-11 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white">칭호 저장</button>
          {message && <div className="mt-3 text-xs text-muted" role="status">{message}</div>}
        </>
      )}
    </section>
  )
}
