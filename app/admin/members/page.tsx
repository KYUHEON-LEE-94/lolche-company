'use client'

import { useEffect, useState } from 'react'
import { supabaseClient } from '@/lib/supabase'

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

export default function AdminMemberListPage() {
  const [members, setMembers] = useState<MemberRow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadMembers = async () => {
    setLoading(true)
    setError(null)
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

      if (error) {
        console.error(error)
        setError('멤버 목록을 불러오는 데 실패했습니다.')
        return
      }

      setMembers((data ?? []) as MemberRow[])
    } catch (e) {
      console.error(e)
      setError('알 수 없는 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [])

  const handleSync = async (id: string) => {
    setSyncingId(id)
    setError(null)
    try {
      const res = await fetch(`/api/members/${id}/sync`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('sync error', body)
        if (res.status === 429) {
          setError('라이엇 API 호출 제한 때문에 동기화가 차단되었습니다. 잠시 후 다시 시도해주세요.')
        } else {
          setError(`동기화 실패 (status: ${res.status}) ${body.error ?? ''}`)
        }
        return
      }

      await loadMembers()
    } catch (e) {
      console.error(e)
      setError('동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncingId(null)
    }
  }

  const [syncAllLoading, setSyncAllLoading] = useState(false)

  const handleSyncAll = async () => {
    setSyncAllLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/sync-all', { method: 'POST' })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('sync-all error', body)
        if (res.status === 429) {
          setError('라이엇 API 호출 제한 때문에 전체 동기화가 중단되었습니다.')
        } else {
          setError(`전체 동기화 실패 (status: ${res.status}) ${body.error ?? ''}`)
        }
        return
      }

      await loadMembers()
    } catch (e) {
      console.error(e)
      setError('전체 동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncAllLoading(false)
    }
  }

  const getTierColor = (tier: string | null) => {
    if (!tier) return 'text-slate-500'
    const t = tier.toUpperCase()
    if (t.includes('CHALLENGER')) return 'text-yellow-500 font-bold'
    if (t.includes('GRANDMASTER')) return 'text-red-500 font-bold'
    if (t.includes('MASTER')) return 'text-purple-600 font-bold'
    if (t.includes('DIAMOND')) return 'text-blue-500 font-semibold'
    if (t.includes('EMERALD')) return 'text-emerald-500 font-semibold'
    if (t.includes('PLATINUM')) return 'text-cyan-500 font-semibold'
    if (t.includes('GOLD')) return 'text-amber-500'
    if (t.includes('SILVER')) return 'text-slate-400'
    if (t.includes('BRONZE')) return 'text-orange-600'
    if (t.includes('IRON')) return 'text-stone-600'
    return 'text-slate-500'
  }

  const getTierBadgeStyle = (tier: string | null) => {
    if (!tier) return 'bg-slate-100 text-slate-600'
    const t = tier.toUpperCase()
    if (t.includes('CHALLENGER')) return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-lg shadow-yellow-500/30'
    if (t.includes('GRANDMASTER')) return 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/30'
    if (t.includes('MASTER')) return 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/30'
    if (t.includes('DIAMOND')) return 'bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-md shadow-blue-500/30'
    if (t.includes('EMERALD')) return 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/30'
    if (t.includes('PLATINUM')) return 'bg-gradient-to-r from-cyan-400 to-cyan-600 text-white shadow-md shadow-cyan-500/30'
    if (t.includes('GOLD')) return 'bg-gradient-to-r from-amber-300 to-amber-500 text-white shadow-md shadow-amber-500/30'
    if (t.includes('SILVER')) return 'bg-gradient-to-r from-slate-300 to-slate-400 text-white'
    if (t.includes('BRONZE')) return 'bg-gradient-to-r from-orange-400 to-orange-600 text-white'
    if (t.includes('IRON')) return 'bg-gradient-to-r from-stone-400 to-stone-600 text-white'
    return 'bg-slate-100 text-slate-600'
  }

  return (
      <div>
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-800 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-2">
                멤버 랭크 현황
              </h1>
              <p className="text-slate-600 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                등록된 멤버들의 TFT 랭크 정보를 확인하고 동기화하세요
              </p>
            </div>

            <button
                type="button"
                onClick={handleSyncAll}
                disabled={syncAllLoading || loading}
                className="group relative px-5 py-3 rounded-xl font-semibold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/40 hover:shadow-xl hover:shadow-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 overflow-hidden"
            >
            <span className="relative z-10 flex items-center gap-2">
              {syncAllLoading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    전체 동기화 중...
                  </>
              ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    전체 동기화
                  </>
              )}
            </span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
            <div className="flex flex-col items-center justify-center py-16">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-blue-200 rounded-full"></div>
                <div className="absolute top-0 left-0 w-16 h-16 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
              </div>
              <p className="mt-4 text-slate-600 font-medium">멤버 목록을 불러오는 중...</p>
            </div>
        )}

        {/* Error Message */}
        {error && (
            <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <p className="text-red-900 font-semibold">{error}</p>
              </div>
            </div>
        )}

        {/* Empty State */}
        {!loading && members.length === 0 && (
            <div className="text-center py-16 bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl border-2 border-dashed border-slate-300">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-slate-200 to-slate-300 mb-4">
                <svg className="w-10 h-10 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <p className="text-xl font-bold text-slate-700 mb-2">등록된 멤버가 없습니다</p>
              <p className="text-slate-500">상단의 "멤버 등록" 메뉴에서 멤버를 추가하세요</p>
            </div>
        )}

        {/* Members Table */}
        {members.length > 0 && (
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-xl overflow-hidden">
              <div className="relative overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                  <tr className="bg-gradient-to-r from-slate-100 via-blue-50 to-indigo-50 border-b-2 border-slate-200">
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      단톡방 ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Riot ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      TFT 랭크
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Double Up
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-slate-700 uppercase tracking-wider">
                      최근 동기화
                    </th>
                    <th className="sticky right-0 bg-gradient-to-r from-slate-100 via-blue-50 to-indigo-50 px-6 py-4 text-xs font-bold text-slate-700 uppercase tracking-wider">
                      동기화
                    </th>
                  </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                  {members.map((m, idx) => (
                      <tr
                          key={m.id}
                          className={`group hover:bg-gradient-to-r hover:from-blue-50/50 hover:to-indigo-50/50 transition-all duration-200 ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                          }`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                            <span className="font-bold text-slate-800 max-w-[160px] truncate">
                          {m.member_name}
                        </span>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-700 max-w-[260px] truncate">
                            <span className="font-semibold">{m.riot_game_name}</span>
                            <span className="text-slate-400">#{m.riot_tagline}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {m.tft_tier ? (
                              <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getTierBadgeStyle(m.tft_tier)}`}>
                            {m.tft_tier} {m.tft_rank ?? ''}
                          </span>
                                <span className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 rounded">
                            {m.tft_league_points ?? 0}LP
                          </span>
                              </div>
                          ) : (
                              <span className="px-3 py-1 text-xs font-medium text-slate-400 bg-slate-100 rounded-lg italic">
                          Unranked
                        </span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {m.tft_doubleup_tier ? (
                              <div className="flex items-center gap-2">
                          <span className={`px-3 py-1 rounded-lg text-xs font-bold ${getTierBadgeStyle(m.tft_doubleup_tier)}`}>
                            {m.tft_doubleup_tier} {m.tft_doubleup_rank ?? ''}
                          </span>
                                <span className="px-2 py-1 text-xs font-semibold text-slate-600 bg-slate-100 rounded">
                            {m.tft_doubleup_league_points ?? 0}LP
                          </span>
                              </div>
                          ) : (
                              <span className="px-3 py-1 text-xs font-medium text-slate-400 bg-slate-100 rounded-lg italic">
                          Unranked
                        </span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {m.last_synced_at ? (
                              <div className="flex items-center gap-2 text-xs text-slate-600">
                                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="font-medium">
                            {new Date(m.last_synced_at).toLocaleString('ko-KR', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                              </div>
                          ) : (
                              <span className="text-slate-400">-</span>
                          )}
                        </td>

                        <td className={`sticky right-0 px-6 py-4 whitespace-nowrap text-right shadow-[-2px_0_8px_rgba(0,0,0,0.05)] ${
                            idx % 2 === 0 ? 'bg-white group-hover:bg-blue-50/50' : 'bg-slate-50/30 group-hover:bg-blue-50/50'
                        }`}>
                          <button
                              onClick={() => handleSync(m.id)}
                              disabled={syncingId === m.id}
                              className="group/btn relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 hover:shadow-lg hover:shadow-blue-500/40 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 overflow-hidden"
                          >
                        <span className="relative z-10 flex items-center gap-2">
                          {syncingId === m.id ? (
                              <>
                                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                동기화 중...
                              </>
                          ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                동기화
                              </>
                          )}
                        </span>
                            <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 transform scale-x-0 group-hover/btn:scale-x-100 transition-transform origin-left"></div>
                          </button>
                        </td>
                      </tr>
                  ))}
                  </tbody>
                </table>
              </div>
            </div>
        )}
      </div>
  )
}