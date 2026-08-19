'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { formatDiscordVoiceDuration } from '@/lib/discord/activityHelpers'

type Row = {
  memberId: string | null
  displayName: string
  avatarUrl: string | null
  linked: boolean
  voiceSeconds: number
  voiceJoins: number
  attendanceDays: number
  messages: number
}
type ApiResult = {
  status: 'ready' | 'unconfigured' | 'unavailable'
  period: { from: string; to: string }
  rows: Row[]
}

type Mode = 'day' | 'week' | 'month' | 'range'
type SortKey = 'voice' | 'days' | 'messages'

const MODE_LABELS: Record<Mode, string> = { day: '일별', week: '주별', month: '월별', range: '기간 지정' }
const SORT_LABELS: Record<SortKey, string> = { voice: '음성 시간', days: '활동일', messages: '메시지' }

/** 날짜 문자열 산술은 UTC 자정 기준으로 처리해 브라우저 타임존 영향을 없앤다(KST는 DST 없음). */
function addDays(date: string, delta: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10)
}
function monthLastDay(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
}

export default function DiscordActivityAdminClient({ today }: { today: string }) {
  const [mode, setMode] = useState<Mode>('week')
  const [dayDate, setDayDate] = useState(today)
  const [weekEnd, setWeekEnd] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [rangeFrom, setRangeFrom] = useState(addDays(today, -6))
  const [rangeTo, setRangeTo] = useState(today)
  const [sortKey, setSortKey] = useState<SortKey>('voice')

  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const period = useMemo(() => {
    if (mode === 'day') return { from: dayDate, to: dayDate }
    if (mode === 'week') return { from: addDays(weekEnd, -6), to: weekEnd }
    if (mode === 'month') {
      const to = monthLastDay(month)
      return { from: `${month}-01`, to: to > today ? today : to }
    }
    return { from: rangeFrom, to: rangeTo }
  }, [mode, dayDate, weekEnd, month, rangeFrom, rangeTo, today])

  const load = useCallback(async () => {
    if (period.from > period.to) {
      setError('시작일이 종료일보다 늦습니다.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/discord-activity?from=${period.from}&to=${period.to}`, { cache: 'no-store' })
      const body = (await res.json().catch(() => null)) as ApiResult | { error?: string } | null
      if (!res.ok || !body || !('status' in body)) {
        setError((body && 'error' in body && body.error) || '불러오지 못했습니다.')
        setData(null)
        return
      }
      setData(body)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period])

  useEffect(() => { load() }, [load])

  const rows = useMemo(() => {
    if (!data) return []
    const measured = data.rows.filter((r) => r.voiceSeconds > 0 || r.attendanceDays > 0 || r.messages > 0)
    return [...measured].sort((a, b) => {
      const metric = sortKey === 'voice' ? b.voiceSeconds - a.voiceSeconds : sortKey === 'days' ? b.attendanceDays - a.attendanceDays : b.messages - a.messages
      return metric || a.displayName.localeCompare(b.displayName, 'ko')
    })
  }, [data, sortKey])

  const totals = useMemo(() => rows.reduce(
    (acc, r) => ({ voice: acc.voice + r.voiceSeconds, messages: acc.messages + r.messages, active: acc.active + 1 }),
    { voice: 0, messages: 0, active: 0 },
  ), [rows])

  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-ink">Discord</p>
        <h1 className="mt-1 text-2xl font-black text-fg">디스코드 활동</h1>
        <p className="mt-1 text-sm text-muted">음성 채널 체류 시간·활동일·메시지를 기간별로 집계합니다. (KST 기준)</p>
      </div>

      {/* 기간 모드 */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(MODE_LABELS) as Mode[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={`min-h-9 rounded-lg px-3 text-sm font-bold transition ${mode === key ? 'bg-brand text-white shadow-sm' : 'bg-surface-2 text-muted hover:text-fg'}`}
          >
            {MODE_LABELS[key]}
          </button>
        ))}
      </div>

      {/* 기간 입력 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
        {mode === 'day' && (
          <DateField label="날짜" value={dayDate} max={today} onChange={setDayDate} />
        )}
        {mode === 'week' && (
          <>
            <DateField label="기준일" value={weekEnd} max={today} onChange={setWeekEnd} />
            <span className="text-xs text-muted">→ 최근 7일 ({period.from} ~ {period.to})</span>
          </>
        )}
        {mode === 'month' && (
          <label className="flex items-center gap-2 text-xs font-bold text-muted">
            월
            <input type="month" value={month} max={today.slice(0, 7)} onChange={(e) => setMonth(e.target.value)} className={INPUT} />
          </label>
        )}
        {mode === 'range' && (
          <>
            <DateField label="시작" value={rangeFrom} max={today} onChange={setRangeFrom} />
            <DateField label="종료" value={rangeTo} max={today} onChange={setRangeTo} />
          </>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs font-bold text-muted">
          정렬
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={INPUT}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => <option key={key} value={key}>{SORT_LABELS[key]}</option>)}
          </select>
        </label>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard label="총 음성 시간" value={formatDiscordVoiceDuration(totals.voice)} />
        <SummaryCard label="활동 멤버" value={`${totals.active}명`} />
        <SummaryCard label="총 메시지" value={`${totals.messages.toLocaleString('ko-KR')}개`} />
      </div>

      {/* 결과 */}
      {loading ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">불러오는 중…</div>
      ) : error ? (
        <div className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center text-sm font-bold text-danger-ink">{error}</div>
      ) : data && data.status !== 'ready' ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
          Discord 활동 API를 사용할 수 없습니다. 환경변수(DISCORD_ACTIVITY_*) 설정을 확인해 주세요.
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">이 기간에 활동 기록이 없습니다.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="hidden grid-cols-[40px_minmax(0,1fr)_120px_90px_90px_90px] gap-3 border-b border-line px-4 py-2.5 text-[11px] font-black uppercase tracking-wide text-faint sm:grid">
            <span className="text-center">#</span><span>멤버</span>
            <span className="text-right">음성 시간</span><span className="text-right">활동일</span><span className="text-right">메시지</span><span className="text-right">음성 참여</span>
          </div>
          <div className="divide-y divide-line">
            {rows.map((row, index) => (
              <div key={row.memberId ?? row.displayName + index} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 sm:grid-cols-[40px_minmax(0,1fr)_120px_90px_90px_90px] sm:px-4">
                <span className="text-center text-xs font-black tabular-nums text-subtle">{index + 1}</span>
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-line bg-surface-2">
                    {row.avatarUrl ? <Image src={row.avatarUrl} alt="" fill sizes="32px" className="object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-muted">{row.displayName.slice(0, 1)}</span>}
                  </div>
                  <span className="min-w-0 truncate text-sm font-bold text-fg">{row.displayName}</span>
                  {!row.linked && <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-bold text-faint">미연결</span>}
                </div>
                <p className="text-right text-sm font-black tabular-nums text-brand-ink sm:text-sm">{formatDiscordVoiceDuration(row.voiceSeconds)}</p>
                <p className="hidden text-right text-xs font-bold tabular-nums text-muted sm:block">{row.attendanceDays}일</p>
                <p className="hidden text-right text-xs font-bold tabular-nums text-muted sm:block">{row.messages.toLocaleString('ko-KR')}</p>
                <p className="hidden text-right text-xs font-bold tabular-nums text-muted sm:block">{row.voiceJoins}회</p>
                <p className="col-start-2 col-end-4 text-[11px] text-muted sm:hidden">활동 {row.attendanceDays}일 · 메시지 {row.messages.toLocaleString('ko-KR')} · 참여 {row.voiceJoins}회</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {data?.status === 'ready' && !loading && !error && (
        <p className="text-right text-[11px] text-faint">집계 기간 {data.period.from} ~ {data.period.to}</p>
      )}
    </div>
  )
}

const INPUT = 'min-h-9 rounded-lg border border-line bg-surface px-3 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand/40'

function DateField({ label, value, max, onChange }: { label: string; value: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs font-bold text-muted">
      {label}
      <input type="date" value={value} max={max} onChange={(e) => onChange(e.target.value)} className={INPUT} />
    </label>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-3 py-3 sm:px-5 sm:py-4">
      <p className="truncate text-[10px] font-bold text-muted sm:text-xs">{label}</p>
      <p className="mt-1 truncate text-sm font-black tabular-nums text-fg sm:text-xl">{value}</p>
    </div>
  )
}
