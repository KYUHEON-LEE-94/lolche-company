'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import SteamGamePicker, { type SteamGameSelection } from '@/app/custom-games/_components/SteamGamePicker'
import { LOL_CAPACITY, LOL_MODES, TFT_TEAM_CAPACITY, type GameKind, type LolMode } from '@/lib/customGames/constants'
import { GAME_KIND_OPTIONS, LOL_MODE_LABELS } from '@/lib/customGames/display'
import { ALERT, BTN_DANGER, BTN_GHOST, BTN_NEUTRAL, BTN_PRIMARY, CARD, INPUT } from '@/lib/ui/styles'

type EventType = 'birthday' | 'anniversary' | 'event'
type Recurrence = 'none' | 'yearly'
type CalendarEventView = { source: 'calendar'; id: string; title: string; description: string | null; event_type: EventType; recurrence: Recurrence; event_date: string | null; event_month: number; event_day: number; is_all_day: boolean; event_time: string | null; member_id: string; member_name: string; can_manage: boolean }
type CustomGameView = { source: 'custom_game'; id: string; title: string; event_day: number; event_time: string; scheduled_at: string; status: string; game_label: string; href: string; can_manage: false }
type SystemEventView = { source: 'system'; system_type: 'tft_patch_note' | 'steam_deal'; id: string; title: string; description: string | null; event_day: number; event_time: string | null; href: string; can_manage: false }
type SeasonEndView = { source: 'season_end'; id: string; title: string; event_day: number; event_time: string | null; href: string; can_manage: false }
type CalendarItem = CalendarEventView | CustomGameView | SystemEventView | SeasonEndView
type MemberOption = { id: string; member_name: string }
type Permissions = { isAdmin: boolean; canCreate: boolean; canCreateGame: boolean; viewerMemberId: string | null }
type CalendarPayload = { events: CalendarItem[]; memberOptions: MemberOption[]; permissions: Permissions; migration_required: boolean }
type FormState = { title: string; description: string; event_type: EventType; recurrence: Recurrence; event_date: string; event_month: number; event_day: number; is_all_day: boolean; event_time: string; member_id: string }
type GameForm = { title: string; date: string; time: string; capacity: number; gameKind: GameKind; kindLabel: string; steamGame: SteamGameSelection; lolMode: LolMode; gameType: 'solo' | 'team'; maxRounds: number }
type CalendarCell = { year: number; month: number; day: number; isCurrentMonth: boolean }

const LABEL: Record<EventType, string> = { birthday: '생일', anniversary: '기념일', event: '일정' }
const CHIP: Record<EventType, string> = { birthday: 'border-pink-400/25 bg-pink-400/10 text-pink-700 dark:text-pink-300', anniversary: 'border-violet-400/25 bg-violet-400/10 text-violet-700 dark:text-violet-300', event: 'border-sky-400/25 bg-sky-400/10 text-sky-700 dark:text-sky-300' }
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function kstToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts()
  const number = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return { year: number('year'), month: number('month'), day: number('day') }
}
function dateValue(year: number, month: number, day: number) { return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
function emptyForm(year: number, month: number, memberId = ''): FormState { return { title: '', description: '', event_type: 'event', recurrence: 'none', event_date: dateValue(year, month, 1), event_month: month, event_day: 1, is_all_day: true, event_time: '09:00', member_id: memberId } }
function emptyGameForm(year: number, month: number, day: number): GameForm { return { title: '', date: dateValue(year, month, day), time: '21:00', capacity: 8, gameKind: 'tft', kindLabel: '', steamGame: { label: '', appId: null }, lolMode: 'rift', gameType: 'solo', maxRounds: 5 } }
function isCalendarItem(value: unknown): value is CalendarItem {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  if (row.source === 'custom_game') return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.event_day === 'number' && typeof row.href === 'string'
  if (row.source === 'system') return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.event_day === 'number' && typeof row.href === 'string' && (row.system_type === 'tft_patch_note' || row.system_type === 'steam_deal')
  if (row.source === 'season_end') return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.event_day === 'number' && typeof row.href === 'string'
  return row.source === 'calendar' && typeof row.id === 'string' && typeof row.title === 'string' && typeof row.event_day === 'number' && typeof row.event_type === 'string' && typeof row.member_id === 'string'
}
function isPayload(value: unknown): value is CalendarPayload {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return Array.isArray(row.events) && row.events.every(isCalendarItem) && Array.isArray(row.memberOptions) && !!row.permissions && typeof row.permissions === 'object' && typeof row.migration_required === 'boolean'
}
async function errorMessage(response: Response) {
  const data: unknown = await response.json().catch(() => null)
  return data && typeof data === 'object' && 'error' in data && typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : '요청을 처리하지 못했습니다.'
}

export default function HomeCalendar() {
  const today = useMemo(kstToday, [])
  const [view, setView] = useState({ year: today.year, month: today.month })
  const [payload, setPayload] = useState<CalendarPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<CalendarEventView | null | undefined>(undefined)
  const [form, setForm] = useState(() => emptyForm(today.year, today.month))
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [createMode, setCreateMode] = useState<'event' | 'game'>('event')
  const [gameForm, setGameForm] = useState(() => emptyGameForm(today.year, today.month, today.day))
  const [createdGame, setCreatedGame] = useState<{ id: string; title: string } | null>(null)
  const requestId = useRef(0)

  const load = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current
    setLoading(true); setError(null)
    try {
      const response = await fetch(`/api/calendar-events?year=${view.year}&month=${view.month}`, { cache: 'no-store', signal })
      if (!response.ok) throw new Error(await errorMessage(response))
      const data: unknown = await response.json()
      if (!isPayload(data)) throw new Error('캘린더 응답 형식이 올바르지 않습니다.')
      if (id === requestId.current) setPayload(data)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (id === requestId.current) setError(e instanceof Error ? e.message : '오류 발생')
    } finally { if (id === requestId.current) setLoading(false) }
  }, [view.year, view.month])
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load])

  const cells = useMemo(() => {
    const leading = new Date(Date.UTC(view.year, view.month - 1, 1)).getUTCDay()
    return Array.from({ length: 42 }, (_, index): CalendarCell => {
      const date = new Date(Date.UTC(view.year, view.month - 1, index - leading + 1))
      return {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        isCurrentMonth: date.getUTCFullYear() === view.year && date.getUTCMonth() + 1 === view.month,
      }
    })
  }, [view])
  const byDay = useMemo(() => {
    const map = new Map<number, CalendarItem[]>()
    for (const event of payload?.events ?? []) map.set(event.event_day, [...(map.get(event.event_day) ?? []), event])
    return map
  }, [payload])

  function move(delta: number) { const zero = view.year * 12 + view.month - 1 + delta; setView({ year: Math.floor(zero / 12), month: zero % 12 + 1 }) }
  function openCreate(year = view.year, month = view.month, day = 1) {
    const next = emptyForm(year, month, payload?.permissions.viewerMemberId ?? payload?.memberOptions[0]?.id ?? '')
    setEditing(null)
    setCreateMode('event')
    setGameForm(emptyGameForm(year, month, day))
    setCreatedGame(null)
    setForm({ ...next, event_date: dateValue(year, month, day), event_month: month, event_day: day })
    setFormError(null)
  }
  function openCellCreate(cell: CalendarCell) {
    if (!cell.isCurrentMonth) setView({ year: cell.year, month: cell.month })
    openCreate(cell.year, cell.month, cell.day)
  }
  function openEdit(event: CalendarEventView) { setEditing(event); setCreateMode('event'); setForm({ title: event.title, description: event.description ?? '', event_type: event.event_type, recurrence: event.recurrence, event_date: event.event_date ?? dateValue(view.year, view.month, event.event_day), event_month: event.event_month, event_day: event.event_day, is_all_day: event.is_all_day, event_time: event.event_time?.slice(0, 5) ?? '09:00', member_id: event.member_id }); setFormError(null) }
  function changeType(type: EventType) { setForm((old) => ({ ...old, event_type: type, recurrence: type === 'event' ? old.recurrence : 'yearly', ...(type === 'event' ? {} : { is_all_day: true, event_time: '' }) })) }

  async function save() {
    setSaving(true); setFormError(null)
    const body = { ...form, event_date: form.recurrence === 'none' ? form.event_date : null, event_time: form.event_type === 'event' && !form.is_all_day ? form.event_time : null }
    try {
      const response = await fetch(editing ? `/api/calendar-events/${editing.id}` : '/api/calendar-events', { method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!response.ok) throw new Error(await errorMessage(response))
      setEditing(undefined); await load()
    } catch (e) { setFormError(e instanceof Error ? e.message : '오류 발생') } finally { setSaving(false) }
  }
  async function saveGame() {
    if (!gameForm.title.trim() || !gameForm.date || !gameForm.time) { setFormError('제목과 일자, 시간을 입력해 주세요.'); return }
    if (gameForm.gameKind === 'etc' && !gameForm.kindLabel.trim()) { setFormError('기타 게임 이름을 입력해 주세요.'); return }
    const capacity = gameForm.gameKind === 'lol' ? LOL_CAPACITY : gameForm.gameKind === 'tft' && gameForm.gameType === 'team' ? TFT_TEAM_CAPACITY : gameForm.capacity
    setSaving(true); setFormError(null)
    try {
      const response = await fetch('/api/custom-games', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        title: gameForm.title.trim(), scheduled_date: gameForm.date, scheduled_time: gameForm.time, capacity,
        game_kind: gameForm.gameKind,
        game_kind_label: gameForm.gameKind === 'etc' ? gameForm.kindLabel.trim() : gameForm.gameKind === 'steam' ? gameForm.steamGame.label.trim() || null : null,
        ...(gameForm.gameKind === 'steam' ? { steam_app_id: gameForm.steamGame.appId } : {}),
        ...(gameForm.gameKind === 'lol' ? { lol_mode: gameForm.lolMode } : {}),
        ...(gameForm.gameKind === 'tft' ? { game_type: gameForm.gameType, max_rounds: gameForm.maxRounds } : {}),
      }) })
      if (!response.ok) throw new Error(await errorMessage(response))
      const result: unknown = await response.json()
      if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string') throw new Error('내전 생성 응답이 올바르지 않습니다.')
      setCreatedGame({ id: result.id, title: gameForm.title.trim() })
      await load()
    } catch (e) { setFormError(e instanceof Error ? e.message : '오류 발생') } finally { setSaving(false) }
  }
  async function remove() {
    if (!editing || !window.confirm(`“${editing.title}” 일정을 삭제할까요?`)) return
    setSaving(true); setFormError(null)
    try { const response = await fetch(`/api/calendar-events/${editing.id}`, { method: 'DELETE' }); if (!response.ok) throw new Error(await errorMessage(response)); setEditing(undefined); await load() }
    catch (e) { setFormError(e instanceof Error ? e.message : '오류 발생') } finally { setSaving(false) }
  }

  return <section id="calendar" className={`${CARD} scroll-mt-20 overflow-hidden`} aria-labelledby="calendar-title">
    <div className="border-b border-line px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:px-5">
      <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-ink">Community calendar</p><div className="mt-1 flex items-baseline gap-3"><h2 id="calendar-title" className="text-xl font-black text-fg">멤버 일정</h2><strong className="text-sm font-black text-muted">{view.year}년 {view.month}월</strong></div></div>
      <div className="mt-3 flex items-center gap-1.5 sm:mt-0 sm:gap-2">
        <button className={`${BTN_NEUTRAL} min-h-11 px-3`} onClick={() => move(-1)} aria-label="이전 달">‹</button>
        <button className={`${BTN_NEUTRAL} min-h-11 px-3`} onClick={() => move(1)} aria-label="다음 달">›</button>
        <button className={`${BTN_GHOST} min-h-11 px-3`} onClick={() => setView({ year: today.year, month: today.month })}>오늘</button>
        {payload?.permissions.canCreate && <button className={`${BTN_PRIMARY} min-h-11 min-w-0 flex-1 px-3 sm:flex-none`} onClick={() => openCreate()}>일정 추가</button>}
      </div>
    </div>
    {error ? <div className="p-5"><p className={ALERT.error}>{error}</p><button className={`${BTN_GHOST} mt-3`} onClick={() => void load()}>다시 시도</button></div> : <>
      {payload?.migration_required && <div className="border-b border-line p-3"><p className={ALERT.warn}>멤버 일정은 DB 마이그레이션 적용 후 사용할 수 있어요. 내전 일정은 계속 표시됩니다.</p></div>}
      <div
        className="border-b border-line bg-surface-2/70"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
      >
        {WEEKDAYS.map((day, i) => <div key={day} className={`border-r border-line py-1 text-center text-[10px] font-black last:border-r-0 ${i === 0 ? 'text-danger-ink' : i === 6 ? 'text-brand-ink' : 'text-muted'}`}>{day}</div>)}
      </div>
      <div
        className="border-l border-line"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}
        data-calendar-grid="month"
      >
        {cells.map((cell, index) => {
          const events = cell.isCurrentMonth ? byDay.get(cell.day) ?? [] : []
          const isToday = cell.day === today.day && cell.year === today.year && cell.month === today.month
          const weekday = index % 7
          const canCreate = payload?.permissions.canCreate === true
          return <div
            key={`${cell.year}-${cell.month}-${cell.day}`}
            className={`relative min-h-[54px] min-w-0 overflow-hidden border-b border-r border-line p-1 sm:min-h-[64px] sm:p-1.5 ${cell.isCurrentMonth ? 'bg-surface' : 'bg-surface-2/55'}`}
            onClick={() => canCreate && openCellCreate(cell)}
            role={canCreate ? 'button' : undefined}
            tabIndex={canCreate ? 0 : undefined}
            onKeyDown={(event) => { if (canCreate && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openCellCreate(cell) } }}
            aria-label={`${cell.year}년 ${cell.month}월 ${cell.day}일${canCreate ? ' 일정 추가' : ''}`}
          >
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${isToday ? 'bg-brand text-white shadow-sm' : !cell.isCurrentMonth ? 'text-faint' : weekday === 0 ? 'text-danger-ink' : weekday === 6 ? 'text-brand-ink' : 'text-muted'}`}>{cell.day}</span>
            {cell.isCurrentMonth && <div className="mt-1 space-y-1">{events.slice(0, 2).map((event) => {
              if (event.source === 'custom_game') return <Link key={`game-${event.id}`} href={event.href} onClick={(clickEvent) => clickEvent.stopPropagation()} title={`${event.event_time.slice(0, 5)} · ${event.game_label} · ${event.title}`} className="block w-full truncate rounded border border-amber-400/30 bg-amber-400/10 px-1 py-1 text-left text-[9px] font-bold leading-tight text-warn-ink sm:px-1.5 sm:text-[11px]">⚔ {event.event_time.slice(0, 5)} {event.title}</Link>
              if (event.source === 'season_end') return <Link key={event.id} href={event.href} onClick={(clickEvent) => clickEvent.stopPropagation()} title={`${event.event_time?.slice(0, 5) ?? ''} · ${event.title}`} className="block w-full truncate rounded border border-rose-400/30 bg-rose-400/10 px-1 py-1 text-left text-[9px] font-bold leading-tight text-rose-700 dark:text-rose-300 sm:px-1.5 sm:text-[11px]">⌛ {event.event_time?.slice(0, 5)} {event.title}</Link>
              if (event.source === 'system') {
                const isPatchNote = event.system_type === 'tft_patch_note'
                return <Link key={event.id} href={event.href} onClick={(clickEvent) => clickEvent.stopPropagation()} title={`${event.title}${event.description ? ` · ${event.description}` : ''}`} className={`block w-full truncate rounded border px-1 py-1 text-left text-[9px] font-bold leading-tight sm:px-1.5 sm:text-[11px] ${isPatchNote ? 'border-brand/30 bg-brand/10 text-brand-ink' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-300'}`}>{isPatchNote ? '✦' : '♨'} {event.title}</Link>
              }
              const editable = event.can_manage
              return <button key={`event-${event.id}`} type="button" disabled={!editable} onClick={(clickEvent) => { clickEvent.stopPropagation(); if (editable) openEdit(event) }} title={`${LABEL[event.event_type]} · ${event.member_name} · ${event.title}`} className={`block w-full truncate rounded border px-1 py-1 text-left text-[9px] font-bold leading-tight sm:px-1.5 sm:text-[11px] ${CHIP[event.event_type]} disabled:cursor-default`}>{event.event_type === 'event' && !event.is_all_day ? `${event.event_time?.slice(0, 5)} ` : ''}{event.title}</button>
            })}{events.length > 2 && <p className="truncate px-1 text-[9px] font-bold text-subtle">+{events.length - 2}개</p>}</div>}
          </div>
        })}
      </div>
      {loading && <p className="border-t border-line px-5 py-3 text-xs text-subtle">일정을 불러오는 중…</p>}
    </>}
    {editing !== undefined && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="event-form-title" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(undefined) }}>
      <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-panel p-5 shadow-2xl sm:rounded-2xl sm:p-6">
        <div className="flex items-center justify-between"><h3 id="event-form-title" className="text-lg font-black text-fg">{editing ? '일정 수정' : createMode === 'game' ? '내전 모집' : '일정 추가'}</h3><button className={`${BTN_NEUTRAL} min-h-11`} disabled={saving} onClick={() => setEditing(undefined)} aria-label="닫기">×</button></div>
        {!editing && payload?.permissions.canCreateGame && <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-1"><button type="button" className={createMode === 'event' ? BTN_PRIMARY : BTN_NEUTRAL} onClick={() => { setCreateMode('event'); setCreatedGame(null); setFormError(null) }}>멤버 일정</button><button type="button" className={createMode === 'game' ? BTN_PRIMARY : BTN_NEUTRAL} onClick={() => { setCreateMode('game'); setCreatedGame(null); setFormError(null) }}>내전 모집</button></div>}
        <div className="mt-5 space-y-4">
          {createMode === 'event' ? <>
          {payload?.permissions.isAdmin && <label className="block text-xs font-bold text-muted">멤버<select className={`${INPUT} mt-1`} value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })}>{payload.memberOptions.map((m) => <option key={m.id} value={m.id}>{m.member_name}</option>)}</select></label>}
          <label className="block text-xs font-bold text-muted">제목<input className={`${INPUT} mt-1`} maxLength={80} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label className="block text-xs font-bold text-muted">종류<select className={`${INPUT} mt-1`} value={form.event_type} onChange={(e) => changeType(e.target.value as EventType)}><option value="birthday">생일</option><option value="anniversary">기념일</option><option value="event">일반 일정</option></select></label>
          {form.event_type === 'event' && <label className="block text-xs font-bold text-muted">반복<select className={`${INPUT} mt-1`} value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value as Recurrence })}><option value="none">한 번</option><option value="yearly">매년</option></select></label>}
          {form.recurrence === 'none' ? <label className="block text-xs font-bold text-muted">날짜<input type="date" min="2000-01-01" max="2100-12-31" className={`${INPUT} mt-1`} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} /></label> : <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-muted">월<input type="number" min={1} max={12} className={`${INPUT} mt-1`} value={form.event_month} onChange={(e) => setForm({ ...form, event_month: Number(e.target.value) })} /></label><label className="text-xs font-bold text-muted">일<input type="number" min={1} max={31} className={`${INPUT} mt-1`} value={form.event_day} onChange={(e) => setForm({ ...form, event_day: Number(e.target.value) })} /></label></div>}
          {form.event_type === 'event' && <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 text-sm font-bold text-fg"><input type="checkbox" checked={form.is_all_day} onChange={(e) => setForm({ ...form, is_all_day: e.target.checked })} />하루 종일</label>}
          {form.event_type === 'event' && !form.is_all_day && <label className="block text-xs font-bold text-muted">알림 시간 (KST)<input type="time" className={`${INPUT} mt-1`} value={form.event_time} onChange={(e) => setForm({ ...form, event_time: e.target.value })} /></label>}
          <label className="block text-xs font-bold text-muted">설명<textarea className={`${INPUT} mt-1 min-h-24 resize-y`} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          </> : <>
            <label className="block text-xs font-bold text-muted">제목<input className={`${INPUT} mt-1`} maxLength={60} value={gameForm.title} onChange={(e) => setGameForm({ ...gameForm, title: e.target.value })} placeholder="예) 금요일 저녁 내전" /></label>
            <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold text-muted">일자<input type="date" className={`${INPUT} mt-1`} value={gameForm.date} onChange={(e) => setGameForm({ ...gameForm, date: e.target.value })} /></label><label className="text-xs font-bold text-muted">시간 (KST)<input type="time" className={`${INPUT} mt-1`} value={gameForm.time} onChange={(e) => setGameForm({ ...gameForm, time: e.target.value })} /></label></div>
            <div><p className="mb-2 text-xs font-bold text-muted">게임 종류</p><div className="grid grid-cols-4 gap-2">{GAME_KIND_OPTIONS.map((option) => <button key={option.value} type="button" className={gameForm.gameKind === option.value ? BTN_PRIMARY : BTN_NEUTRAL} onClick={() => setGameForm({ ...gameForm, gameKind: option.value })}>{option.label}</button>)}</div></div>
            {gameForm.gameKind === 'etc' && <label className="block text-xs font-bold text-muted">게임 이름<input className={`${INPUT} mt-1`} maxLength={30} value={gameForm.kindLabel} onChange={(e) => setGameForm({ ...gameForm, kindLabel: e.target.value })} /></label>}
            {gameForm.gameKind === 'steam' && <SteamGamePicker value={gameForm.steamGame} onChange={(steamGame) => setGameForm({ ...gameForm, steamGame })} disabled={saving} />}
            {gameForm.gameKind === 'lol' && <div><p className="mb-2 text-xs font-bold text-muted">롤 모드</p><div className="grid grid-cols-2 gap-2">{LOL_MODES.map((mode) => <button key={mode} type="button" className={gameForm.lolMode === mode ? BTN_PRIMARY : BTN_NEUTRAL} onClick={() => setGameForm({ ...gameForm, lolMode: mode })}>{LOL_MODE_LABELS[mode]}</button>)}</div><p className="mt-2 text-xs text-subtle">정원 10명 고정</p></div>}
            {gameForm.gameKind === 'tft' && <><div><p className="mb-2 text-xs font-bold text-muted">게임 방식</p><div className="grid grid-cols-2 gap-2"><button type="button" className={gameForm.gameType === 'solo' ? BTN_PRIMARY : BTN_NEUTRAL} onClick={() => setGameForm({ ...gameForm, gameType: 'solo' })}>개인전</button><button type="button" className={gameForm.gameType === 'team' ? BTN_PRIMARY : BTN_NEUTRAL} onClick={() => setGameForm({ ...gameForm, gameType: 'team' })}>팀전</button></div></div><label className="block text-xs font-bold text-muted">최대 판수<input type="number" min={1} max={20} className={`${INPUT} mt-1`} value={gameForm.maxRounds} onChange={(e) => setGameForm({ ...gameForm, maxRounds: Number(e.target.value) })} /></label></>}
            {gameForm.gameKind !== 'lol' && !(gameForm.gameKind === 'tft' && gameForm.gameType === 'team') && <label className="block text-xs font-bold text-muted">정원<input type="number" min={2} max={100} className={`${INPUT} mt-1`} value={gameForm.capacity} onChange={(e) => setGameForm({ ...gameForm, capacity: Number(e.target.value) })} /></label>}
            {createdGame && <p className={ALERT.ok}>내전을 만들었습니다. <Link className="font-black underline" href={`/custom-games/${createdGame.id}`}>{createdGame.title} 상세 보기</Link></p>}
          </>}
          {formError && <p className={ALERT.error}>{formError}</p>}
        </div>
        <div className="mt-5 flex flex-wrap justify-between gap-2"><div>{editing && <button className={`${BTN_DANGER} min-h-11`} disabled={saving} onClick={() => void remove()}>삭제</button>}</div><div className="flex gap-2"><button className={`${BTN_NEUTRAL} min-h-11`} disabled={saving} onClick={() => setEditing(undefined)}>{createdGame ? '닫기' : '취소'}</button>{!createdGame && <button className={`${BTN_PRIMARY} min-h-11`} disabled={saving || (createMode === 'event' && (!form.title.trim() || !form.member_id)) || (createMode === 'game' && !gameForm.title.trim())} onClick={() => void (createMode === 'game' ? saveGame() : save())}>{saving ? '저장 중…' : createMode === 'game' ? '내전 만들기' : '저장'}</button>}</div></div>
      </div>
    </div>}
  </section>
}
