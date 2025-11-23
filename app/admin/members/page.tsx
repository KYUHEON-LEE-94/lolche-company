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
      .select(
          `
          id,
          member_name,
          riot_game_name,
          riot_tagline,
          tft_tier,
          tft_rank,
          tft_league_points,
          tft_doubleup_tier,
          tft_doubleup_rank,
          tft_doubleup_league_points,
          last_synced_at
        `,
      )
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
      const res = await fetch(`/api/members/${id}/sync`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('sync error', body)
        if (res.status === 429) {
          setError(
              '라이엇 API 호출 제한(Too Many Requests) 때문에 동기화가 잠시 차단되었습니다. 잠시 후 다시 시도해주세요.',
          )
        } else {
          setError(
              `동기화 실패 (status: ${res.status}) ${body.error ?? ''}`,
          )
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

  const getTierColor = (tier: string | null) => {
    if (!tier) return 'text-gray-500'
    const t = tier.toUpperCase()
    if (t.includes('CHALLENGER')) return 'text-yellow-600 font-bold'
    if (t.includes('GRANDMASTER')) return 'text-red-600 font-bold'
    if (t.includes('MASTER')) return 'text-purple-600 font-bold'
    if (t.includes('DIAMOND')) return 'text-blue-600 font-semibold'
    if (t.includes('EMERALD')) return 'text-emerald-600 font-semibold'
    if (t.includes('PLATINUM')) return 'text-teal-600 font-semibold'
    if (t.includes('GOLD')) return 'text-yellow-600'
    if (t.includes('SILVER')) return 'text-gray-600'
    if (t.includes('BRONZE')) return 'text-orange-700'
    if (t.includes('IRON')) return 'text-gray-700'
    return 'text-gray-500'
  }

  return (
      <div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            멤버 리스트 / 랭크 동기화
          </h1>
          <p className="text-gray-600">
            등록된 멤버들의 TFT 랭크 정보를 확인하고 동기화할 수 있습니다.
          </p>
        </div>

        {loading && (
            <div className="flex items-center justify-center py-12">
              <svg className="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24">
                <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                />
                <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
        )}

        {error && (
            <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                  />
                </svg>
                <p className="text-red-800 font-medium">{error}</p>
              </div>
            </div>
        )}

        {!loading && members.length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
              <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
              >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <p className="mt-4 text-gray-600 font-medium">등록된 멤버가 없습니다</p>
              <p className="mt-1 text-sm text-gray-500">
                상단의 "멤버 등록" 메뉴에서 멤버를 추가하세요
              </p>
            </div>
        )}

        {members.length > 0 && (
            <div className="overflow-hidden border border-gray-200 rounded-lg shadow-sm">
              {/* 🔥 sticky 컬럼이 동작하도록 relative + overflow-x-auto */}
              <div className="relative overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      단톡방 ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      Riot ID
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      TFT 랭크
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      DOUBLE UP 랭크
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      최근 동기화
                    </th>
                    {/* 🔥 동기화 버튼 sticky 헤더 */}
                    <th className="sticky right-0 bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                      동작
                    </th>
                  </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                  {members.map((m) => (
                      <tr
                          key={m.id}
                          className="group hover:bg-gray-50 transition-colors"
                      >
                        {/* 단톡방 ID - 너무 길면 … */}
                        <td className="px-6 py-4">
                          <div className="font-medium text-gray-900 inline-block max-w-[160px] truncate">
                            {m.member_name}
                          </div>
                        </td>

                        {/* Riot ID - 닉+태그 전체에 ellipsis */}
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-700 inline-block max-w-[260px] truncate">
                            {m.riot_game_name}
                            <span className="text-gray-400">#{m.riot_tagline}</span>
                          </div>
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {m.tft_tier ? (
                              <div className="flex items-center gap-2">
                          <span className={getTierColor(m.tft_tier)}>
                            {m.tft_tier} {m.tft_rank ?? ''}
                          </span>
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {m.tft_league_points ?? 0}LP
                          </span>
                              </div>
                          ) : (
                              <span className="text-sm text-gray-400 italic">
                          Unranked
                        </span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap">
                          {m.tft_doubleup_tier ? (
                              <div className="flex items-center gap-2">
                          <span className={getTierColor(m.tft_doubleup_tier)}>
                            {m.tft_doubleup_tier} {m.tft_doubleup_rank ?? ''}
                          </span>
                                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                            {m.tft_doubleup_league_points ?? 0}LP
                          </span>
                              </div>
                          ) : (
                              <span className="text-sm text-gray-400 italic">
                          Unranked
                        </span>
                          )}
                        </td>

                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500">
                          {m.last_synced_at ? (
                              <div className="flex items-center gap-1">
                                <svg
                                    className="w-3.5 h-3.5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                  <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                {new Date(m.last_synced_at).toLocaleString('ko-KR', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                          ) : (
                              '-'
                          )}
                        </td>

                        {/* 🔥 sticky 동기화 버튼 셀 */}
                        <td className="sticky right-0 bg-white group-hover:bg-gray-50 px-6 py-4 whitespace-nowrap text-right shadow-[inset_1px_0_0_rgba(229,231,235,1)]">
                          <button
                              onClick={() => handleSync(m.id)}
                              disabled={syncingId === m.id}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md"
                          >
                            {syncingId === m.id ? (
                                <>
                                  <svg
                                      className="animate-spin h-4 w-4"
                                      viewBox="0 0 24 24"
                                  >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                        fill="none"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                  </svg>
                                  동기화 중...
                                </>
                            ) : (
                                <>
                                  <svg
                                      className="w-4 h-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                  >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    />
                                  </svg>
                                  다시 동기화
                                </>
                            )}
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
