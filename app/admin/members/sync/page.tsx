'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/app/components/Spinner'
import type { MemberStatus } from '@/types/supabase'
import { tierScore } from '@/lib/tft/tierScore'
import { ALERT, CARD, INPUT, KICKER } from '@/lib/ui/styles'

type MemberRow = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  status: MemberStatus
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_league_points: number | null
  sync_status: string | null
  last_sync_error: string | null
  last_sync_finished_at: string | null
  last_synced_at: string | null
  login_linked: boolean
  discord_registered: boolean
}

type Banner = { tone: 'error' | 'success' | 'warn'; msg: string }
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected'
type LoginFilter = 'all' | 'linked' | 'unlinked'
type SortKey = 'tier' | 'recent' | 'name'

// ─── 티어 스타일 (도메인 색 — 로컬 상수 유지) ────────────────────────────────

const TIER_BADGE: Record<string, { text: string; bg: string; dot: string }> = {
  CHALLENGER:  { text: 'text-yellow-300',  bg: 'bg-yellow-500/10 border border-yellow-500/20',  dot: 'bg-yellow-400'  },
  GRANDMASTER: { text: 'text-red-300',     bg: 'bg-red-500/10 border border-red-500/20',        dot: 'bg-red-400'     },
  MASTER:      { text: 'text-purple-300',  bg: 'bg-purple-500/10 border border-purple-500/20',  dot: 'bg-purple-400'  },
  DIAMOND:     { text: 'text-blue-300',    bg: 'bg-blue-500/10 border border-blue-500/20',      dot: 'bg-blue-400'    },
  EMERALD:     { text: 'text-emerald-300', bg: 'bg-emerald-500/10 border border-emerald-500/20', dot: 'bg-emerald-400' },
  PLATINUM:    { text: 'text-cyan-300',    bg: 'bg-cyan-500/10 border border-cyan-500/20',      dot: 'bg-cyan-400'    },
  GOLD:        { text: 'text-amber-300',   bg: 'bg-amber-500/10 border border-amber-500/20',    dot: 'bg-amber-400'   },
  SILVER:      { text: 'text-slate-300',   bg: 'bg-slate-400/10 border border-slate-400/20',    dot: 'bg-slate-400'   },
  BRONZE:      { text: 'text-orange-300',  bg: 'bg-orange-500/10 border border-orange-500/20',  dot: 'bg-orange-400'  },
  IRON:        { text: 'text-gray-300',    bg: 'bg-gray-500/10 border border-gray-500/20',      dot: 'bg-gray-400'    },
}

const STATUS_BADGE: Record<MemberStatus, { label: string; cls: string }> = {
  pending:  { label: '대기', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  approved: { label: '승인', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  rejected: { label: '거절', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
}

function TierBadge({
                     tier, rank, lp,
                   }: { tier: string | null; rank: string | null; lp: number | null }) {
  if (!tier) return <span className="text-xs text-slate-600 italic">Unranked</span>
  const s = TIER_BADGE[tier.toUpperCase()] ?? {
    text: 'text-slate-500', bg: 'bg-slate-700/30 border border-slate-600/20', dot: 'bg-slate-600',
  }
  return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${s.bg} ${s.text}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
        {tier} {rank ?? ''} · {lp ?? 0} LP
      </span>
  )
}

function StatusBadge({ status }: { status: MemberStatus }) {
  const s = STATUS_BADGE[status]
  return <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${s.cls}`}>{s.label}</span>
}

function LoginBadge({ linked, discord }: { linked: boolean; discord: boolean }) {
  if (linked) {
    return <span className="px-2 py-0.5 rounded-md text-[10px] font-black border bg-sky-500/10 text-sky-300 border-sky-500/30">로그인 연결됨</span>
  }
  if (discord) {
    return <span className="px-2 py-0.5 rounded-md text-[10px] font-black border bg-violet-500/10 text-violet-300 border-violet-500/30">Discord 사전등록</span>
  }
  return <span className="px-2 py-0.5 rounded-md text-[10px] font-black border bg-slate-700/30 text-slate-500 border-slate-600/30">미로그인</span>
}

function SyncFailBadge() {
  return <span className="px-2 py-0.5 rounded-md text-[10px] font-black border bg-red-500/10 text-red-300 border-red-500/30">동기화 실패</span>
}

function formatSyncTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function AdminMemberSyncPage() {
  const router = useRouter()
  const [ready,          setReady]          = useState(false)
  const [members,        setMembers]        = useState<MemberRow[]>([])
  const [loading,        setLoading]        = useState(true)
  const [syncingId,      setSyncingId]      = useState<string | null>(null)
  const [syncAllLoading, setSyncAllLoading] = useState(false)
  const [banner,         setBanner]         = useState<Banner | null>(null)

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loginFilter,  setLoginFilter]  = useState<LoginFilter>('all')
  const [failedOnly,   setFailedOnly]   = useState(false)
  const [sortKey,      setSortKey]      = useState<SortKey>('tier')

  const showMsg = (tone: Banner['tone'], msg: string) => {
    setBanner({ tone, msg })
    setTimeout(() => setBanner(null), 4000)
  }

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/members')
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '멤버 목록을 불러오지 못했습니다.')
      setMembers(body.members as MemberRow[])
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '멤버 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/admin/me', { method: 'GET' })
      if (res.status === 401) { router.replace('/admin/login'); return }
      if (res.status === 403) { router.replace('/'); return }
      setReady(true)
    })()
  }, [router])

  useEffect(() => { if (ready) loadMembers() }, [ready, loadMembers])

  const handleSync = async (id: string) => {
    setSyncingId(id)
    try {
      const res  = await fetch(`/api/members/${id}/sync`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok || body?.ok === false) throw new Error(body?.error)
      if (body?.skipped) {
        const remain = body.nextAllowedInSec ? `${body.nextAllowedInSec}초 후 가능` : '잠시 후 다시 시도하세요'
        showMsg('warn', `이미 최신 상태입니다. (${remain})`)
      } else {
        showMsg('success', '동기화 완료!')
        await loadMembers()
      }
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '동기화 실패')
    } finally {
      setSyncingId(null)
    }
  }

  const handleSyncAll = async () => {
    setSyncAllLoading(true)
    try {
      let cursorId: string | null = null
      let totalProcessed = 0

      while (true) {
        const res: Response = await fetch('/api/admin/sync-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursorId }),
        })
        const body = await res.json().catch(() => ({})) as { processed?: number; batch?: { done: boolean; nextCursorId?: string }; error?: string }

        if (!res.ok) {
          showMsg('error', res.status === 429
              ? '라이엇 API 제한 · 전체 동기화가 중단되었습니다.'
              : `전체 동기화 실패 (${res.status}) ${body.error ?? ''}`)
          return
        }

        totalProcessed += body.processed ?? 0

        if (body.batch?.done !== false) break
        cursorId = body.batch.nextCursorId ?? null
        if (!cursorId) break
      }

      // sync-all 은 "갱신 필요분(stale/stuck)"만 처리하므로 0명도 정상이다.
      showMsg('success', totalProcessed > 0
          ? `갱신 필요 멤버 ${totalProcessed}명을 동기화했습니다.`
          : '갱신이 필요한 멤버가 없습니다. (모두 최신)')
      await loadMembers()
    } catch {
      showMsg('error', '전체 동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncAllLoading(false)
    }
  }

  // ─── 상단 요약 집계 ─────────────────────────────────────────────────────────
  const summary = useMemo(() => {
    return members.reduce(
        (acc, m) => {
          acc.total += 1
          acc[m.status] += 1
          if (!m.login_linked) acc.unlinked += 1
          if (m.sync_status === 'failed') acc.failed += 1
          if (m.last_sync_finished_at && (!acc.lastSync || m.last_sync_finished_at > acc.lastSync)) {
            acc.lastSync = m.last_sync_finished_at
          }
          return acc
        },
        { total: 0, pending: 0, approved: 0, rejected: 0, unlinked: 0, failed: 0, lastSync: null as string | null },
    )
  }, [members])

  // ─── 검색 / 필터 / 정렬 ──────────────────────────────────────────────────────
  const visible = useMemo(() => {
    const term = search.trim()
    let list = members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (loginFilter === 'linked' && !m.login_linked) return false
      if (loginFilter === 'unlinked' && m.login_linked) return false
      if (failedOnly && m.sync_status !== 'failed') return false
      if (term && !(m.member_name.includes(term) || m.riot_game_name.includes(term))) return false
      return true
    })

    list = [...list].sort((a, b) => {
      if (sortKey === 'name') return a.member_name.localeCompare(b.member_name, 'ko')
      if (sortKey === 'recent') {
        return (b.last_synced_at ?? '').localeCompare(a.last_synced_at ?? '')
      }
      // tier: 점수 내림차순, 동점이면 이름
      const diff = tierScore(b.tft_tier, b.tft_rank, b.tft_league_points) - tierScore(a.tft_tier, a.tft_rank, a.tft_league_points)
      if (diff !== 0) return diff
      return a.member_name.localeCompare(b.member_name, 'ko')
    })

    return list
  }, [members, search, statusFilter, loginFilter, failedOnly, sortKey])

  if (!ready)
    return (
        <div className="flex items-center justify-center py-20 gap-2.5 text-slate-500">
          <Spinner size={4} />
          <span className="text-sm font-medium tracking-tight">권한 확인 중...</span>
        </div>
    )

  const selectCls = `${INPUT} !w-auto !py-2`

  return (
      <div>
        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between mb-6 gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight mb-1">멤버 랭크 현황</h1>
            <p className="text-sm text-slate-500">멤버들의 TFT 정보를 조회·동기화합니다</p>
          </div>

          <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncAllLoading || loading}
              aria-busy={syncAllLoading}
              className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors bg-brand/10 border border-brand/30 text-indigo-300 hover:bg-brand/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {syncAllLoading ? (
                <><Spinner /> 전체 동기화 중...</>
            ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                    <path d="M4 4v5h5M20 20v-5h-5M4.582 9a8 8 0 0115.356 4M19.418 15a8 8 0 01-15.356-4" />
                  </svg>
                  전체 동기화
                </>
            )}
          </button>
        </div>

        {/* ── 상단 요약 바 ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <SummaryCard label="총원" value={summary.total} />
          <SummaryCard label="승인 / 대기 / 거절" value={`${summary.approved} / ${summary.pending} / ${summary.rejected}`} />
          <SummaryCard label="로그인 미연결" value={summary.unlinked} tone={summary.unlinked > 0 ? 'warn' : undefined} />
          <SummaryCard label="동기화 실패" value={summary.failed} tone={summary.failed > 0 ? 'danger' : undefined} />
          <SummaryCard label="마지막 동기화" value={formatSyncTime(summary.lastSync)} className="col-span-2 sm:col-span-1" />
        </div>

        {/* ── 알림 배너 ── */}
        {banner && (
            <div
                role={banner.tone === 'error' ? 'alert' : 'status'}
                aria-live={banner.tone === 'error' ? 'assertive' : 'polite'}
                className={`mb-6 ${banner.tone === 'error' ? ALERT.error : banner.tone === 'warn' ? ALERT.warn : ALERT.ok}`}
            >
              {banner.msg}
            </div>
        )}

        {/* ── 검색 / 필터 / 정렬 ── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
          <div className="relative flex-1">
            <input
                type="text"
                placeholder="이름 · Riot ID 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className={`${INPUT} !pl-10`}
                aria-label="멤버 검색"
            />
            <svg className="absolute left-3 top-3 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectCls} aria-label="상태 필터">
              <option value="all">상태 전체</option>
              <option value="pending">대기</option>
              <option value="approved">승인</option>
              <option value="rejected">거절</option>
            </select>
            <select value={loginFilter} onChange={(e) => setLoginFilter(e.target.value as LoginFilter)} className={selectCls} aria-label="로그인 연결 필터">
              <option value="all">연결 전체</option>
              <option value="linked">연결됨</option>
              <option value="unlinked">미연결</option>
            </select>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={selectCls} aria-label="정렬 기준">
              <option value="tier">티어순</option>
              <option value="recent">최근 동기화순</option>
              <option value="name">이름순</option>
            </select>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold text-slate-300 bg-surface border border-line cursor-pointer select-none">
              <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} className="accent-red-500" />
              실패만
            </label>
          </div>
        </div>

        {/* ── 로딩 ── */}
        {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
              <Spinner size={6} />
              <p className="text-sm font-semibold tracking-wide opacity-80">멤버 목록 로딩 중...</p>
            </div>
        )}

        {/* ── 빈 상태 ── */}
        {!loading && visible.length === 0 && (
            <div className={`flex flex-col items-center justify-center py-20 border-dashed ${CARD}`}>
              <p className="text-slate-400 font-bold mb-1">표시할 멤버가 없습니다</p>
              <p className="text-slate-600 text-sm">검색어·필터를 조정하거나 [멤버 등록]에서 추가하세요</p>
            </div>
        )}

        {/* ── 데스크톱: 테이블 (md 이상) ── */}
        {!loading && visible.length > 0 && (
            <>
              <div className={`hidden md:block ${CARD} overflow-hidden`}>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse">
                    <thead>
                    <tr className="bg-surface border-b border-line">
                      {['단톡방 ID', 'Riot ID', 'TFT 솔로', 'TFT 더블업', '최근 동기화'].map((label) => (
                          <th key={label} className="px-4 py-3.5 text-left text-[10px] font-black text-slate-500 tracking-widest uppercase whitespace-nowrap">
                            {label}
                          </th>
                      ))}
                      <th className="sticky right-0 bg-canvas border-l border-line px-4 py-3.5 text-right text-[10px] font-black text-slate-500 tracking-widest uppercase">
                        동기화
                      </th>
                    </tr>
                    </thead>
                    <tbody>
                    {visible.map((m) => {
                      const isSyncing = syncingId === m.id
                      const failed = m.sync_status === 'failed'
                      return (
                          <tr key={m.id} className="group even:bg-surface hover:bg-surface-2 border-b border-line transition-colors">
                            <td className="px-4 py-3.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-white text-sm truncate max-w-[140px]">{m.member_name}</span>
                                <StatusBadge status={m.status} />
                              </div>
                              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                                <LoginBadge linked={m.login_linked} discord={m.discord_registered} />
                                {failed && <SyncFailBadge />}
                              </div>
                              {failed && m.last_sync_error && (
                                  <div className="mt-1 text-[11px] text-red-400/80 truncate max-w-[220px]" title={m.last_sync_error}>
                                    {m.last_sync_error}
                                  </div>
                              )}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="text-sm text-slate-300 block truncate max-w-[200px]">
                                {m.riot_game_name}<span className="text-slate-600">#{m.riot_tagline}</span>
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <TierBadge tier={m.tft_tier} rank={m.tft_rank} lp={m.tft_league_points} />
                            </td>
                            <td className="px-4 py-3.5">
                              <TierBadge tier={m.tft_doubleup_tier} rank={m.tft_doubleup_rank} lp={m.tft_doubleup_league_points} />
                            </td>
                            <td className="px-4 py-3.5">
                              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                                {m.last_synced_at ? formatSyncTime(m.last_synced_at) : '-'}
                              </span>
                            </td>
                            <td className="sticky right-0 bg-canvas border-l border-line px-4 py-3.5 text-right">
                              <button
                                  onClick={() => handleSync(m.id)}
                                  disabled={!!syncingId}
                                  aria-busy={isSyncing}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors bg-brand/10 border border-brand/25 text-indigo-300 hover:bg-brand/20 disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                {isSyncing ? (
                                    <><Spinner size={3} /> 동기화 중</>
                                ) : (
                                    <>
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                                        <path d="M4 4v5h5M20 20v-5h-5M4.582 9a8 8 0 0115.356 4M19.418 15a8 8 0 01-15.356-4" />
                                      </svg>
                                      동기화
                                    </>
                                )}
                              </button>
                            </td>
                          </tr>
                      )
                    })}
                    </tbody>
                  </table>
                </div>
                <div className="px-5 py-3 border-t border-line bg-surface">
                  <span className="text-xs text-slate-600 font-medium">총 {visible.length}명</span>
                </div>
              </div>

              {/* ── 모바일: 카드 리스트 (md 미만) ── */}
              <div className="md:hidden grid gap-3">
                {visible.map((m) => {
                  const isSyncing = syncingId === m.id
                  const failed = m.sync_status === 'failed'
                  return (
                      <div key={m.id} className={`${CARD} p-4 space-y-3`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-white truncate">{m.member_name}</span>
                              <StatusBadge status={m.status} />
                            </div>
                            <div className="text-xs text-slate-400 mt-1 truncate">
                              {m.riot_game_name}<span className="text-slate-600">#{m.riot_tagline}</span>
                            </div>
                          </div>
                          <button
                              onClick={() => handleSync(m.id)}
                              disabled={!!syncingId}
                              aria-busy={isSyncing}
                              className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors bg-brand/10 border border-brand/25 text-indigo-300 hover:bg-brand/20 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isSyncing ? (
                                <><Spinner size={3} /> 동기화 중</>
                            ) : (
                                <>
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                                    <path d="M4 4v5h5M20 20v-5h-5M4.582 9a8 8 0 0115.356 4M19.418 15a8 8 0 01-15.356-4" />
                                  </svg>
                                  동기화
                                </>
                            )}
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <LoginBadge linked={m.login_linked} discord={m.discord_registered} />
                          {failed && <SyncFailBadge />}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <TierBadge tier={m.tft_tier} rank={m.tft_rank} lp={m.tft_league_points} />
                          <TierBadge tier={m.tft_doubleup_tier} rank={m.tft_doubleup_rank} lp={m.tft_doubleup_league_points} />
                        </div>

                        {failed && m.last_sync_error && (
                            <div className="text-[11px] text-red-400/80 break-words">{m.last_sync_error}</div>
                        )}

                        <div className="text-[11px] text-slate-600">
                          최근 동기화: {m.last_synced_at ? formatSyncTime(m.last_synced_at) : '-'}
                        </div>
                      </div>
                  )
                })}
                <div className="text-xs text-slate-600 font-medium px-1">총 {visible.length}명</div>
              </div>
            </>
        )}
      </div>
  )
}

// ─── 요약 카드 ────────────────────────────────────────────────────────────────

function SummaryCard({
                       label, value, tone, className = '',
                     }: { label: string; value: string | number; tone?: 'warn' | 'danger'; className?: string }) {
  const valueColor = tone === 'danger' ? 'text-red-300' : tone === 'warn' ? 'text-amber-300' : 'text-white'
  return (
      <div className={`${CARD} px-4 py-3 ${className}`}>
        <div className={`${KICKER} text-slate-500 mb-1`}>{label}</div>
        <div className={`text-lg font-black tracking-tight ${valueColor}`}>{value}</div>
      </div>
  )
}
