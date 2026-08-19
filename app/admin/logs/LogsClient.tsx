'use client'

import { useCallback, useEffect, useState } from 'react'

type LogRow = { id: string; type: string; status: string; member_name: string; message: string | null; duration_ms: number | null; created_at: string }
type StaleRow = { id: string; member_name: string; last_synced_at: string | null }
type Summary = { last_synced_at: string | null; stale_hours: number; stale_count: number; approved_count: number; counts: { success: number; skipped: number; error: number } }
type Payload = { summary: Summary; stale: StaleRow[]; logs: LogRow[] }
type Filter = '' | 'error' | 'skipped' | 'success'

function fmt(iso: string | null): string {
  if (!iso) return '기록 없음'
  try {
    return new Intl.DateTimeFormat('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(iso))
  } catch {
    return ''
  }
}
function ago(iso: string | null): string {
  if (!iso) return ''
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (sec < 60) return `${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}시간 전`
  return `${Math.floor(hr / 24)}일 전`
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  success: { label: '성공', cls: 'text-ok-ink bg-emerald-500/10 border-emerald-500/25' },
  skipped: { label: '스킵', cls: 'text-muted bg-surface-2 border-line' },
  error: { label: '실패', cls: 'text-danger-ink bg-red-500/10 border-red-500/25' },
}

export default function LogsClient() {
  const [filter, setFilter] = useState<Filter>('')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback((f: Filter) => {
    fetch(`/api/admin/sync-logs?limit=150${f ? `&status=${f}` : ''}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('불러오기 실패'))))
      .then((d: Payload) => { setData(d); setErr(null) })
      .catch((e) => setErr(e instanceof Error ? e.message : '오류'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(filter) }, [filter, load])

  const s = data?.summary
  const stale = (data?.stale ?? [])
  const rows = data?.logs ?? []

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-fg">동기화 로그</h1>
          <p className="text-sm text-subtle">멤버 랭크 동기화의 성공·스킵·실패 기록과 지연 현황을 봅니다.</p>
        </div>
        <button onClick={() => { setLoading(true); load(filter) }} disabled={loading} className="rounded-xl border border-line bg-surface-2 px-4 py-2 text-sm font-bold text-fg transition hover:bg-surface disabled:opacity-50">
          {loading ? '불러오는 중…' : '새로고침'}
        </button>
      </header>

      {err && <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm font-bold text-danger-ink">{err}</div>}

      {/* 요약 */}
      {s && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-xs text-muted">최근 동기화</div>
            <div className="mt-1 text-lg font-black text-fg">{ago(s.last_synced_at) || '기록 없음'}</div>
            <div className="text-[11px] text-faint">{fmt(s.last_synced_at)}</div>
          </div>
          <div className={`rounded-2xl border p-4 ${s.stale_count > 0 ? 'border-red-500/30 bg-red-500/10' : 'border-line bg-surface'}`}>
            <div className="text-xs text-muted">{s.stale_hours}시간 이상 미동기화</div>
            <div className={`mt-1 text-lg font-black ${s.stale_count > 0 ? 'text-danger-ink' : 'text-ok-ink'}`}>{s.stale_count}명 / {s.approved_count}명</div>
            <div className="text-[11px] text-faint">{s.stale_count > 0 ? '아래 목록 확인' : '모두 최신'}</div>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-4">
            <div className="text-xs text-muted">최근 로그 상태</div>
            <div className="mt-1 flex gap-3 text-sm font-black">
              <span className="text-ok-ink">성공 {s.counts.success}</span>
              <span className="text-muted">스킵 {s.counts.skipped}</span>
              <span className="text-danger-ink">실패 {s.counts.error}</span>
            </div>
          </div>
        </section>
      )}

      {/* 지연 멤버 */}
      {stale.length > 0 && (
        <section className="rounded-2xl border border-red-500/25 bg-surface p-4">
          <div className="mb-2 text-sm font-black text-danger-ink">지연 멤버</div>
          <div className="flex flex-wrap gap-2">
            {stale.map((m) => (
              <span key={m.id} className="rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-xs text-muted">
                {m.member_name} · <b className="text-danger-ink/90">{m.last_synced_at ? ago(m.last_synced_at) : '동기화 기록 없음'}</b>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* 필터 */}
      <div className="flex gap-1.5">
        {([['', '전체'], ['error', '실패'], ['skipped', '스킵'], ['success', '성공']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} onClick={() => { if (f !== filter) { setLoading(true); setFilter(f) } }} className={`rounded-lg px-3 py-1.5 text-xs font-black transition-colors ${filter === f ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-fg'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* 로그 목록 */}
      <section className="overflow-hidden rounded-2xl border border-line bg-surface">
        {rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-faint">{loading ? '불러오는 중…' : '로그가 없습니다.'}</div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const st = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'text-muted bg-surface-2 border-line' }
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-black ${st.cls}`}>{st.label}</span>
                  <span className="w-28 shrink-0 truncate font-bold text-fg">{r.member_name}</span>
                  <span className="shrink-0 text-[11px] text-subtle">{r.type === 'cron' ? '크론' : '수동'}</span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted">{r.message ?? ''}</span>
                  {r.duration_ms != null && <span className="shrink-0 text-[11px] text-faint">{(r.duration_ms / 1000).toFixed(1)}s</span>}
                  <span className="shrink-0 text-[11px] text-faint" title={fmt(r.created_at)}>{ago(r.created_at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
