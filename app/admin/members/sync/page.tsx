'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Spinner } from '@/app/components/Spinner'

type MemberRow = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_league_points: number | null
  last_synced_at: string | null
}

// ─── 티어 스타일 ──────────────────────────────────────────────────────────────

const TIER_BADGE: Record<string, { text: string; bg: string; dot: string }> = {
  CHALLENGER:  { text: 'text-yellow-300',  bg: 'bg-yellow-500/10  border border-yellow-500/20',  dot: 'bg-yellow-400'  },
  GRANDMASTER: { text: 'text-red-300',     bg: 'bg-red-500/10     border border-red-500/20',     dot: 'bg-red-400'     },
  MASTER:      { text: 'text-purple-300',  bg: 'bg-purple-500/10  border border-purple-500/20',  dot: 'bg-purple-400'  },
  DIAMOND:     { text: 'text-blue-300',    bg: 'bg-blue-500/10    border border-blue-500/20',    dot: 'bg-blue-400'    },
  EMERALD:     { text: 'text-emerald-300', bg: 'bg-emerald-500/10 border border-emerald-500/20', dot: 'bg-emerald-400' },
  PLATINUM:    { text: 'text-cyan-300',    bg: 'bg-cyan-500/10    border border-cyan-500/20',    dot: 'bg-cyan-400'    },
  GOLD:        { text: 'text-amber-300',   bg: 'bg-amber-500/10   border border-amber-500/20',   dot: 'bg-amber-400'   },
  SILVER:      { text: 'text-slate-300',   bg: 'bg-slate-400/10   border border-slate-400/20',   dot: 'bg-slate-400'   },
  BRONZE:      { text: 'text-orange-300',  bg: 'bg-orange-500/10  border border-orange-500/20',  dot: 'bg-orange-400'  },
  IRON:        { text: 'text-gray-300',    bg: 'bg-gray-500/10    border border-gray-500/20',    dot: 'bg-gray-400'    },
}
const FALLBACK_BADGE = {
  text: 'text-slate-500',
  bg:   'bg-slate-700/30 border border-slate-600/20',
  dot:  'bg-slate-600',
}

function TierBadge({
                     tier, rank, lp,
                   }: { tier: string | null; rank: string | null; lp: number | null }) {
  if (!tier) return <span className="text-xs text-slate-600 italic">Unranked</span>
  const s = TIER_BADGE[tier.toUpperCase()] ?? FALLBACK_BADGE
  return (
      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap ${s.bg} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
        {tier} {rank ?? ''} · {lp ?? 0} LP
    </span>
  )
}

// ─── sticky 컬럼 공통 배경 스타일 ─────────────────────────────────────────────
// 행의 hover 배경과 동일하게 맞춰줘야 sticky cell이 튀어보이지 않습니다.
// 인라인 style로 직접 지정합니다.

const STICKY_BASE: React.CSSProperties = {
  position: 'sticky',
  right: 0,
  zIndex: 10,
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function AdminMemberListPage() {
  const router = useRouter()
  const [ready,          setReady]          = useState(false)
  const [members,        setMembers]        = useState<MemberRow[]>([])
  const [loading,        setLoading]        = useState(true)
  const [syncingId,      setSyncingId]      = useState<string | null>(null)
  const [syncAllLoading, setSyncAllLoading] = useState(false)
  const [error,          setError]          = useState<string | null>(null)
  const [successMsg,     setSuccessMsg]     = useState<string | null>(null)
  // 현재 hover 중인 행 id — sticky cell 배경을 행 hover 색과 맞추기 위해 사용
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const showMsg = (type: 'error' | 'success', msg: string) => {
    if (type === 'error') { setError(msg); setSuccessMsg(null) }
    else { setSuccessMsg(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccessMsg(null) }, 4000)
  }

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await supabaseClient
      .from('members')
      .select(`
          id, member_name, riot_game_name, riot_tagline,
          tft_tier, tft_rank, tft_league_points,
          tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_league_points,
          last_synced_at
        `)
      .order('member_name', { ascending: true })
      if (error) { showMsg('error', '멤버 목록을 불러오는 데 실패했습니다.'); return }
      setMembers((data ?? []) as MemberRow[])
    } catch { showMsg('error', '알 수 없는 오류가 발생했습니다.') }
    finally { setLoading(false) }
  }, [])

  // 권한 체크
  useEffect(() => {
    ;(async () => {
      const res = await fetch('/api/admin/me', { method: 'GET' })
      if (res.status === 401) { router.replace('/admin/login'); return }
      if (res.status === 403) { router.replace('/'); return }
      setReady(true)
    })()
  }, [router])

  useEffect(() => { if (ready) loadMembers() }, [ready, loadMembers])

  if (!ready)
    return (
        <div className="flex items-center justify-center py-20 gap-2.5 text-slate-500">
          <Spinner size={4} />
          <span className="text-sm font-medium tracking-tight">권한 확인 중...</span>
        </div>
    )

  const handleSync = async (id: string) => {
    setSyncingId(id)
    try {
      const res  = await fetch(`/api/members/${id}/sync`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok || body?.ok === false) throw new Error(body?.error)
      showMsg('success', '동기화 완료!')
      await loadMembers()
    } catch (e) {
      showMsg('error', e instanceof Error ? e.message : '동기화 실패')
    } finally {
      setSyncingId(null)
    }
  }

  const handleSyncAll = async () => {
    setSyncAllLoading(true)
    try {
      const res  = await fetch('/api/admin/sync-all', { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        showMsg('error', res.status === 429
            ? '라이엇 API 제한 · 전체 동기화가 중단되었습니다.'
            : `전체 동기화 실패 (${res.status}) ${body.error ?? ''}`)
        return
      }
      showMsg('success', '전체 동기화 완료!')
      await loadMembers()
    } catch { showMsg('error', '전체 동기화 중 오류가 발생했습니다.') }
    finally { setSyncAllLoading(false) }
  }

  // ─── 행 배경색 계산 (일반 / 줄무늬 / hover) ─────────────────────────────────
  const rowBg = (m: MemberRow, idx: number): string => {
    if (hoveredId === m.id) return 'rgba(99,102,241,0.07)'
    return idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'
  }

  // ─── 렌더 ────────────────────────────────────────────────────────────────────

  return (
      <div>

        {/* ── 헤더 ── */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight mb-1">멤버 랭크 현황</h1>
            <p className="text-sm text-slate-500">멤버들의 TFT 정보를 조회·동기화합니다</p>
          </div>

          <button
              type="button"
              onClick={handleSyncAll}
              disabled={syncAllLoading || loading}
              className="
            flex-shrink-0 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl
            text-sm font-bold transition-all duration-200
            bg-indigo-500/10 border border-indigo-500/30 text-indigo-400
            hover:bg-indigo-500/20 hover:text-indigo-300
            disabled:opacity-40 disabled:cursor-not-allowed
          "
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

        {/* ── 알림 배너 ── */}
        {error && (
            <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
        )}
        {successMsg && (
            <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium animate-in fade-in slide-in-from-top-2 duration-200">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {successMsg}
            </div>
        )}

        {/* ── 로딩 ── */}
        {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
              <Spinner size={6} />
              <p className="text-sm font-semibold tracking-wide opacity-80">멤버 목록 로딩 중...</p>
            </div>
        )}

        {/* ── 빈 상태 ── */}
        {!loading && members.length === 0 && (
            <div
                className="flex flex-col items-center justify-center py-20 border border-dashed rounded-2xl"
                style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5} strokeLinecap="round">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-slate-400 font-bold mb-1">등록된 멤버가 없습니다</p>
              <p className="text-slate-600 text-sm">[멤버 등록] 메뉴에서 추가하세요</p>
            </div>
        )}

        {/* ── 테이블 ── */}
        {members.length > 0 && (
            <div
                className="rounded-2xl border overflow-hidden"
                style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              {/* overflow-x-auto를 여기에 적용 → sticky right 동작 보장 */}
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse">

                  {/* ── 헤더 ── */}
                  <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>

                    {/* 일반 헤더 셀 */}
                    {[
                      { label: '단톡방 ID',    w: 'w-36' },
                      { label: 'Riot ID',       w: 'w-52' },
                      { label: 'TFT 솔로',      w: 'w-44' },
                      { label: 'TFT 더블업',    w: 'w-44' },
                      { label: '최근 동기화',   w: 'w-32' },
                    ].map(({ label, w }) => (
                        <th
                            key={label}
                            className={`${w} px-4 py-3.5 text-left text-[10px] font-black text-slate-500 tracking-widest uppercase`}
                        >
                          {label}
                        </th>
                    ))}

                    {/* ✅ sticky 헤더 — 동기화 컬럼 */}
                    <th
                        className="px-4 py-3.5 text-right text-[10px] font-black text-slate-500 tracking-widest uppercase"
                        style={{
                          ...STICKY_BASE,
                          background: 'rgb(14,17,25)',   // 헤더 행과 동일한 어두운 배경
                          borderLeft: '1px solid rgba(255,255,255,0.06)',
                          minWidth: 110,
                        }}
                    >
                      동기화
                    </th>
                  </tr>
                  </thead>

                  {/* ── 바디 ── */}
                  <tbody>
                  {members.map((m, idx) => {
                    const bg = rowBg(m, idx)
                    const isSyncing = syncingId === m.id

                    return (
                        <tr
                            key={m.id}
                            style={{ background: bg, borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                            onMouseEnter={() => setHoveredId(m.id)}
                            onMouseLeave={() => setHoveredId(null)}
                        >
                          {/* 단톡방 ID */}
                          <td className="px-4 py-3.5">
                        <span className="font-bold text-white text-sm block truncate max-w-[140px]">
                          {m.member_name}
                        </span>
                          </td>

                          {/* Riot ID */}
                          <td className="px-4 py-3.5">
                        <span className="text-sm text-slate-300 block truncate max-w-[200px]">
                          {m.riot_game_name}
                          <span className="text-slate-600">#{m.riot_tagline}</span>
                        </span>
                          </td>

                          {/* TFT 솔로 */}
                          <td className="px-4 py-3.5">
                            <TierBadge tier={m.tft_tier} rank={m.tft_rank} lp={m.tft_league_points} />
                          </td>

                          {/* TFT 더블업 */}
                          <td className="px-4 py-3.5">
                            <TierBadge tier={m.tft_doubleup_tier} rank={m.tft_doubleup_rank} lp={m.tft_doubleup_league_points} />
                          </td>

                          {/* 최근 동기화 */}
                          <td className="px-4 py-3.5">
                            {m.last_synced_at ? (
                                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">
                            {new Date(m.last_synced_at).toLocaleString('ko-KR', {
                              month: 'short', day: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </span>
                            ) : (
                                <span className="text-xs text-slate-700">-</span>
                            )}
                          </td>

                          {/* ✅ sticky 동기화 버튼 셀 */}
                          <td
                              className="px-4 py-3.5 text-right"
                              style={{
                                ...STICKY_BASE,
                                // 행 배경과 동일하게 맞춰야 "부유" 현상 없음
                                background: hoveredId === m.id
                                    ? 'rgba(99,102,241,0.07)'
                                    : idx % 2 === 0 ? 'rgb(13,17,23)' : 'rgb(16,20,27)',
                                borderLeft: '1px solid rgba(255,255,255,0.05)',
                              }}
                          >
                            <button
                                onClick={() => handleSync(m.id)}
                                disabled={!!syncingId}
                                className="
                            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-indigo-500/10 border border-indigo-500/25 text-indigo-400
                            hover:bg-indigo-500/20 hover:text-indigo-300
                            disabled:opacity-40 disabled:cursor-not-allowed
                          "
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

              {/* ── 테이블 푸터 ── */}
              <div
                  className="px-5 py-3"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}
              >
                <span className="text-xs text-slate-600 font-medium">총 {members.length}명</span>
              </div>
            </div>
        )}
      </div>
  )
}