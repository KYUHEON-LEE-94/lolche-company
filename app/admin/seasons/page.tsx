'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { archiveSeason, updateSeasonStatusAction } from '@/lib/actions/season-actions'

export default function AdminSeasonManagementPage() {
    const [seasons, setSeasons] = useState<any[]>([])
    // ✅ 1. 초기값을 true로 설정하여 useEffect 내에서 setLoading(true) 호출을 방지합니다.
    const [loading, setLoading] = useState(true)
    const [processingId, setProcessingId] = useState<number | null>(null)
    const [archiveLoading, setArchiveLoading] = useState(false)

    // 새 시즌 등록 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [newSeason, setNewSeason] = useState({ season_name: '', set_number: '' })

    // ✅ 2. loadSeasons 내부의 동기적 setState(setLoading(true))를 제거했습니다.
    const loadSeasons = useCallback(async () => {
        try {
            const { data } = await supabaseClient
                .from('seasons')
                .select('*')
                .order('set_number', { ascending: false })
            if (data) setSeasons(data)
        } catch (e) {
            console.error(e)
        } finally {
            setLoading(false) // 데이터 로드가 끝나면 false로 변경
        }
    }, [])

    useEffect(() => {
        loadSeasons()
    }, [loadSeasons])

    // 새 시즌 등록 로직
    const handleCreateSeason = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newSeason.season_name || !newSeason.set_number) return

        const { error } = await supabaseClient
            .from('seasons')
            .insert({
                season_name: newSeason.season_name,
                set_number: parseInt(newSeason.set_number),
                is_active: false
            })

        if (error) alert('등록 실패: ' + error.message)
        else {
            alert('새 시즌이 등록되었습니다.')
            setIsModalOpen(false)
            setNewSeason({ season_name: '', set_number: '' })
            await loadSeasons()
        }
    }

    // 상태 업데이트 (활성화 / 비활성화)
    const handleUpdateStatus = async (id: number, currentStatus: boolean) => {
        const actionName = currentStatus ? '종료(비활성화)' : '시작(활성화)'
        if (!window.confirm(`시즌을 ${actionName} 하시겠습니까?`)) return

        setProcessingId(id)

        const result = await updateSeasonStatusAction(id, !currentStatus)

        if (!result.ok) {
            alert('실패: ' + result.message)
        } else {
            // 성공 시 목록 새로고침
            await loadSeasons()
        }

        setProcessingId(null)
    }

    // 명예의 전당 아카이브 호출
    const onArchive = async (seasonId: number, type: 'solo' | 'doubleup') => {
        const mode = type === 'solo' ? '솔로 랭크' : '더블업 랭크'
        if (!window.confirm(`현재 멤버들의 [${mode}] 점수를 명예의 전당에 기록하시겠습니까?`)) return

        setArchiveLoading(true)
        const result = await archiveSeason(seasonId, type)
        setArchiveLoading(false)

        if (result.ok) alert(`${mode} 기록 완료!`)
        else alert('에러: ' + result.message)
    }

    const activeSeason = seasons.find(s => s.is_active)

    return (
        <div className="space-y-8">
            {/* 상단 헤더 & 등록 버튼 */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 tracking-tight">시즌 & 명예의 전당 관리</h1>
                    <p className="text-sm text-gray-500">시즌 정보를 관리하고 명예의 전당 데이터를 기록합니다.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-blue-200"
                >
                    + 새 시즌 등록
                </button>
            </div>

            {/* 현재 진행 중인 시즌 카드 */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-3xl p-8 shadow-sm relative overflow-hidden">
                <div className="relative z-10">
                    <h2 className="text-amber-700 font-bold flex items-center gap-2 mb-6">
                        <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-ping"></span>
                        현재 활성화된 시즌
                    </h2>

                    {activeSeason ? (
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                            <div>
                                <p className="text-4xl font-black text-amber-900 tracking-tighter">{activeSeason.season_name}</p>
                                <p className="text-amber-600 font-bold mt-1 uppercase tracking-widest text-sm">SET {activeSeason.set_number}</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => onArchive(activeSeason.id, 'solo')}
                                    disabled={archiveLoading}
                                    className="bg-white text-amber-600 border-2 border-amber-200 px-6 py-3 rounded-2xl font-black hover:border-amber-500 transition-all shadow-sm disabled:opacity-50"
                                >
                                    🏆 솔로 마감
                                </button>
                                <button
                                    onClick={() => onArchive(activeSeason.id, 'doubleup')}
                                    disabled={archiveLoading}
                                    className="bg-white text-indigo-600 border-2 border-indigo-100 px-6 py-3 rounded-2xl font-black hover:border-indigo-500 transition-all shadow-sm disabled:opacity-50"
                                >
                                    🏆 더블업 마감
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-4 border-2 border-dashed border-amber-200 rounded-2xl">
                            <p className="text-amber-600 font-medium italic">활성화된 시즌이 없습니다. 아래 목록에서 시즌을 시작하세요.</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 시즌 목록 테이블 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full">
                    <thead className="bg-gray-50/50 border-b">
                    <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-gray-400 uppercase">시즌 정보</th>
                        <th className="px-6 py-4 text-center text-xs font-bold text-gray-400 uppercase">상태</th>
                        <th className="px-6 py-4 text-right text-xs font-bold text-gray-400 uppercase">제어</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                    {seasons.map((s) => (
                        <tr key={s.id} className={`group transition-colors ${s.is_active ? 'bg-blue-50/30' : 'hover:bg-gray-50'}`}>
                            <td className="px-6 py-5">
                                <p className="font-bold text-gray-800">{s.season_name}</p>
                                <p className="text-xs text-gray-500 font-medium">Set {s.set_number}</p>
                            </td>
                            <td className="px-6 py-5 text-center">
                                {s.is_active ? (
                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-100 text-blue-700">ACTIVE</span>
                                ) : (
                                    <span className="text-[10px] font-bold text-gray-300 uppercase">Inactive</span>
                                )}
                            </td>
                            <td className="px-6 py-5 text-right">
                                {/* ✅ 버튼 디자인 개선: ON/OFF의 시각적 차이를 극대화 */}
                                <button
                                    onClick={() => handleUpdateStatus(s.id, s.is_active)}
                                    disabled={processingId === s.id}
                                    className={`
                      px-5 py-2 rounded-xl text-xs font-bold transition-all transform active:scale-95
                      ${s.is_active
                                        ? 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-600 hover:text-white hover:border-red-600 shadow-sm shadow-red-100'
                                        : 'bg-blue-600 text-white border border-blue-600 hover:bg-blue-700 shadow-md shadow-blue-200'
                                    }
                      disabled:opacity-30
                    `}
                                >
                                    {processingId === s.id ? '...' : s.is_active ? '시즌 종료하기' : '시즌 시작하기'}
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
            </div>

            {/* 팝업 모달: 새 시즌 등록 */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-200">
                        <div className="p-8">
                            <h3 className="text-2xl font-black text-gray-800 mb-2">새 시즌 등록</h3>
                            <p className="text-sm text-gray-500 mb-6">새로운 롤체 시즌 정보를 입력해주세요.</p>

                            <form onSubmit={handleCreateSeason} className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">시즌 이름</label>
                                    <input
                                        type="text"
                                        required
                                        placeholder="예: 시즌 13: 아케인"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                        value={newSeason.season_name}
                                        onChange={e => setNewSeason({...newSeason, season_name: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1 ml-1">세트 번호 (숫자)</label>
                                    <input
                                        type="number"
                                        required
                                        placeholder="예: 13"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none font-medium"
                                        value={newSeason.set_number}
                                        onChange={e => setNewSeason({...newSeason, set_number: e.target.value})}
                                    />
                                </div>

                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setIsModalOpen(false)}
                                        className="flex-1 px-4 py-3 bg-gray-100 text-gray-500 rounded-xl font-bold hover:bg-gray-200 transition-colors"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-black hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
                                    >
                                        등록하기
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}