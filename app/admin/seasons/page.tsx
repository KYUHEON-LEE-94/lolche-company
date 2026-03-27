'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { archiveSeason, updateSeasonStatusAction } from '@/lib/actions/season-actions'

function Spinner({ size = 4 }: { size?: number }) {
    return (
        <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    )
}

const inputCls = `
  w-full px-4 py-3 rounded-xl text-sm font-medium text-white
  bg-white/[0.04] border border-white/[0.08]
  placeholder:text-slate-600
  focus:outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5
  transition-all duration-200
`

export default function AdminSeasonManagementPage() {
    const [seasons,        setSeasons]        = useState<any[]>([])
    const [loading,        setLoading]        = useState(true)
    const [processingId,   setProcessingId]   = useState<number | null>(null)
    const [archiveLoading, setArchiveLoading] = useState(false)
    const [isModalOpen,    setIsModalOpen]    = useState(false)
    const [newSeason,      setNewSeason]      = useState({ season_name: '', set_number: '' })

    const loadSeasons = useCallback(async () => {
        try {
            const { data } = await supabaseClient
                .from('seasons')
                .select('*')
                .order('set_number', { ascending: false })
            if (data) setSeasons(data)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { loadSeasons() }, [loadSeasons])

    const handleCreateSeason = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newSeason.season_name || !newSeason.set_number) return
        const { error } = await supabaseClient.from('seasons').insert({
            season_name: newSeason.season_name,
            set_number:  parseInt(newSeason.set_number),
            is_active:   false,
        })
        if (error) alert('등록 실패: ' + error.message)
        else {
            setIsModalOpen(false)
            setNewSeason({ season_name: '', set_number: '' })
            await loadSeasons()
        }
    }

    const handleUpdateStatus = async (id: number, currentStatus: boolean) => {
        if (!window.confirm(`시즌을 ${currentStatus ? '종료(비활성화)' : '시작(활성화)'} 하시겠습니까?`)) return
        setProcessingId(id)
        const result = await updateSeasonStatusAction(id, !currentStatus)
        if (!result.ok) alert('실패: ' + result.message)
        else await loadSeasons()
        setProcessingId(null)
    }

    const onArchive = async (seasonId: number, type: 'solo' | 'doubleup') => {
        const mode = type === 'solo' ? '솔로 랭크' : '더블업 랭크'
        if (!window.confirm(`현재 멤버들의 [${mode}] 점수를 명예의 전당에 기록하시겠습니까?`)) return
        setArchiveLoading(true)
        const result = await archiveSeason(seasonId, type)
        setArchiveLoading(false)
        alert(result.ok ? `${mode} 기록 완료!` : '에러: ' + result.message)
    }

    const activeSeason = seasons.find((s) => s.is_active)

    return (
        <div className="space-y-8">

            {/* ── 헤더 ── */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-white tracking-tight mb-1">시즌 & 명예의 전당</h1>
                    <p className="text-sm text-slate-500">시즌을 관리하고 명예의 전당 데이터를 기록합니다</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="
            flex-shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl
            text-sm font-bold text-white
            bg-indigo-600 hover:bg-indigo-500
            shadow-lg shadow-indigo-500/20 transition-all duration-200
          "
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                        <path d="M12 5v14M5 12h14" />
                    </svg>
                    새 시즌 등록
                </button>
            </div>

            {/* ── 활성 시즌 카드 ── */}
            <div
                className="rounded-2xl border p-6"
                style={{
                    background: 'linear-gradient(135deg, rgba(245,158,11,0.06) 0%, rgba(217,119,6,0.04) 100%)',
                    borderColor: 'rgba(245,158,11,0.2)',
                }}
            >
                {/* 섹션 라벨 */}
                <div className="flex items-center gap-2 mb-5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
          </span>
                    <span className="text-xs font-black text-amber-500 tracking-widest uppercase">Now Active</span>
                </div>

                {activeSeason ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                        <div>
                            <p className="text-3xl font-black text-white tracking-tight leading-tight">
                                {activeSeason.season_name}
                            </p>
                            <p className="text-sm font-bold text-amber-500/70 tracking-widest uppercase mt-1">
                                SET {activeSeason.set_number}
                            </p>
                        </div>

                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => onArchive(activeSeason.id, 'solo')}
                                disabled={archiveLoading}
                                className="
                  inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold
                  bg-amber-500/10 border border-amber-500/25 text-amber-400
                  hover:bg-amber-500/20 hover:text-amber-300 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
                            >
                                🏆 솔로 마감
                            </button>
                            <button
                                onClick={() => onArchive(activeSeason.id, 'doubleup')}
                                disabled={archiveLoading}
                                className="
                  inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold
                  bg-indigo-500/10 border border-indigo-500/25 text-indigo-400
                  hover:bg-indigo-500/20 hover:text-indigo-300 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed
                "
                            >
                                🏆 더블업 마감
                            </button>
                        </div>
                    </div>
                ) : (
                    <div
                        className="text-center py-5 rounded-xl border border-dashed"
                        style={{ borderColor: 'rgba(245,158,11,0.2)' }}
                    >
                        <p className="text-sm text-amber-600 font-medium">
                            활성화된 시즌이 없습니다. 아래 목록에서 시즌을 시작하세요.
                        </p>
                    </div>
                )}
            </div>

            {/* ── 시즌 목록 ── */}
            {loading ? (
                <div className="flex justify-center py-12 text-slate-500 gap-3">
                    <Spinner size={5} /> 불러오는 중...
                </div>
            ) : (
                <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                    <table className="min-w-full">
                        <thead>
                        <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            {['시즌 정보', '상태', '제어'].map((h, i) => (
                                <th
                                    key={h}
                                    className={`px-5 py-3.5 text-[10px] font-black text-slate-500 tracking-widest uppercase ${i === 2 ? 'text-right' : 'text-left'}`}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                        </thead>
                        <tbody>
                        {seasons.map((s, idx) => (
                            <tr
                                key={s.id}
                                style={{
                                    background: s.is_active
                                        ? 'rgba(245,158,11,0.04)'
                                        : idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                }}
                            >
                                {/* 시즌 정보 */}
                                <td className="px-5 py-4">
                                    <p className="font-bold text-white text-sm">{s.season_name}</p>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">Set {s.set_number}</p>
                                </td>

                                {/* 상태 배지 */}
                                <td className="px-5 py-4">
                                    {s.is_active ? (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        ACTIVE
                      </span>
                                    ) : (
                                        <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Inactive</span>
                                    )}
                                </td>

                                {/* 버튼 */}
                                <td className="px-5 py-4 text-right">
                                    <button
                                        onClick={() => handleUpdateStatus(s.id, s.is_active)}
                                        disabled={processingId === s.id}
                                        className={[
                                            'inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200',
                                            'disabled:opacity-40 disabled:cursor-not-allowed',
                                            s.is_active
                                                ? 'bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20 hover:text-red-300'
                                                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20',
                                        ].join(' ')}
                                    >
                                        {processingId === s.id
                                            ? <><Spinner size={3} /> 처리 중</>
                                            : s.is_active ? '시즌 종료' : '시즌 시작'}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── 새 시즌 등록 모달 ── */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4"
                    style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
                    onClick={(e) => e.target === e.currentTarget && setIsModalOpen(false)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border p-8 animate-in zoom-in-95 duration-200"
                        style={{ background: '#0d1117', borderColor: 'rgba(255,255,255,0.1)' }}
                    >
                        {/* 모달 헤더 */}
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-xl font-black text-white">새 시즌 등록</h3>
                                <p className="text-sm text-slate-500 mt-0.5">새로운 롤체 시즌 정보를 입력하세요</p>
                            </div>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-slate-300 hover:bg-white/5 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                                    <path d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <form onSubmit={handleCreateSeason} className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 tracking-widest uppercase">시즌 이름</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="예: 시즌 17: 아케인"
                                    className={inputCls}
                                    value={newSeason.season_name}
                                    onChange={(e) => setNewSeason({ ...newSeason, season_name: e.target.value })}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="block text-[10px] font-black text-slate-400 tracking-widest uppercase">세트 번호</label>
                                <input
                                    type="number"
                                    required
                                    placeholder="예: 17"
                                    className={inputCls}
                                    value={newSeason.set_number}
                                    onChange={(e) => setNewSeason({ ...newSeason, set_number: e.target.value })}
                                />
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-400 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-all"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 py-3 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all"
                                >
                                    등록하기
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}