'use client'

import Link from 'next/link'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { formatSteamMoney, type SteamFeaturedDeal } from '@/lib/steam/featuredDealsShared'
import { LOL_ENABLED } from '@/lib/constants/features'
import { CARD } from '@/lib/ui/styles'

type TabId = 'tft' | 'lol' | 'steam'
type HomePatchNote = { id: string; title: string; summary: string; publishedAt: string; sourceUrl: string | null }
const TABS: { id: TabId; label: string }[] = [
  { id: 'tft', label: '롤체 패치 노트' },
  ...(LOL_ENABLED ? [{ id: 'lol' as const, label: '롤 패치 노트' }] : []),
  { id: 'steam', label: 'Steam 할인' },
]

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Seoul' }).format(date)
}

export default function HomeNews({ patchNotes, lolPatchNotes = [], deals }: { patchNotes: HomePatchNote[]; lolPatchNotes?: HomePatchNote[]; deals: SteamFeaturedDeal[] | null }) {
  const [activeTab, setActiveTab] = useState<TabId>('tft')
  const idPrefix = useId()
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])
  const selectTab = (index: number) => { const tab = TABS[index]; if (!tab) return; setActiveTab(tab.id); tabRefs.current[index]?.focus() }
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') { event.preventDefault(); selectTab((index + 1) % TABS.length) }
    if (event.key === 'ArrowLeft') { event.preventDefault(); selectTab((index - 1 + TABS.length) % TABS.length) }
    if (event.key === 'Home') { event.preventDefault(); selectTab(0) }
    if (event.key === 'End') { event.preventDefault(); selectTab(TABS.length - 1) }
  }
  return <section className={`${CARD} flex overflow-hidden xl:h-full xl:flex-col`} aria-labelledby="home-news-title">
    <div className="border-b border-line px-4 py-4 sm:px-5"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-ink">Community news</p><h2 id="home-news-title" className="mt-1 text-xl font-black text-fg">새 소식</h2></div>
    <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
      <div role="tablist" aria-label="새 소식 종류" className="mb-4 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface-2 p-1">
        {TABS.map((tab, index) => { const active = activeTab === tab.id; const tabId = `${idPrefix}-${tab.id}-tab`; const panelId = `${idPrefix}-${tab.id}-panel`; return <button key={tab.id} ref={(element) => { tabRefs.current[index] = element }} id={tabId} type="button" role="tab" aria-selected={active} aria-controls={panelId} tabIndex={active ? 0 : -1} onClick={() => setActiveTab(tab.id)} onKeyDown={(event) => onKeyDown(event, index)} className={`min-h-10 shrink-0 rounded-lg px-3 text-xs font-black transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 ${active ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-surface hover:text-fg'}`}>{tab.label}</button> })}
      </div>
      <div id={`${idPrefix}-tft-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tft-tab`} hidden={activeTab !== 'tft'} className="flex flex-1 flex-col">
        {patchNotes.length === 0 ? <p className="rounded-xl border border-line bg-surface-2 px-4 py-5 text-sm text-subtle">현재 시즌의 공개 패치 노트를 준비 중입니다.</p> : <ul className="space-y-2">{patchNotes.map((note) => <li key={note.id} className="rounded-xl border border-line bg-surface px-3 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-black text-fg">{note.title}</p><span className="shrink-0 text-[11px] text-subtle">{formatDate(note.publishedAt)}</span></div>{note.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{note.summary}</p>}{note.sourceUrl && <a href={note.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-brand-ink hover:underline">공식 노트 보기 →</a>}</li>)}</ul>}
        <Link href="/tft" className="mt-4 inline-flex min-h-10 items-center text-xs font-black text-brand-ink hover:underline xl:mt-auto">롤체 패치 노트 전체 보기 →</Link>
      </div>
      {LOL_ENABLED && (
      <div id={`${idPrefix}-lol-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-lol-tab`} hidden={activeTab !== 'lol'} className="flex flex-1 flex-col">
        {lolPatchNotes.length === 0 ? <p className="rounded-xl border border-line bg-surface-2 px-4 py-5 text-sm text-subtle">최근 롤 패치 소식을 준비 중입니다. 다음 자동 갱신 후 표시됩니다.</p> : <ul className="space-y-2">{lolPatchNotes.map((note) => <li key={note.id} className="rounded-xl border border-line bg-surface px-3 py-3"><div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate text-sm font-black text-fg">{note.title}</p><span className="shrink-0 text-[11px] text-subtle">{formatDate(note.publishedAt)}</span></div>{note.summary && <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{note.summary}</p>}{note.sourceUrl && <a href={note.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-bold text-brand-ink hover:underline">공식 노트 보기 →</a>}</li>)}</ul>}
        <Link href="/lol" className="mt-4 inline-flex min-h-10 items-center text-xs font-black text-brand-ink hover:underline xl:mt-auto">롤 랭킹 보기 →</Link>
      </div>
      )}
      <div id={`${idPrefix}-steam-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-steam-tab`} hidden={activeTab !== 'steam'} className="flex flex-1 flex-col">
        {deals === null ? <p className="rounded-xl border border-line bg-surface-2 px-4 py-5 text-sm text-subtle">할인 스냅샷을 준비 중입니다. 다음 자동 갱신 후 표시됩니다.</p> : deals.length === 0 ? <p className="rounded-xl border border-line bg-surface-2 px-4 py-5 text-sm text-subtle">현재 표시할 할인 품목이 없습니다.</p> : <ul className="space-y-2">{deals.slice(0, 4).map((deal) => <li key={deal.appid}><a href={`https://store.steampowered.com/app/${deal.appid}/?cc=kr&l=koreana`} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 transition-colors hover:border-line-strong"><span className="min-w-0 truncate text-sm font-bold text-fg">{deal.name}</span><span className="shrink-0 text-right"><strong className="text-xs font-black text-ok-ink">-{deal.discountPercent}%</strong><span className="ml-2 text-xs font-black text-fg">{formatSteamMoney(deal.finalPrice)}</span></span></a></li>)}</ul>}
        <Link href="/steam" className="mt-4 inline-flex min-h-10 items-center text-xs font-black text-brand-ink hover:underline xl:mt-auto">Steam 할인 전체 보기 →</Link>
      </div>
    </div>
  </section>
}
