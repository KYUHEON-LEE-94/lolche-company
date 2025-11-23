'use client'

import { useMemo, useState } from 'react'
import type { Member } from '@/types/supabase'

type QueueType = 'solo' | 'doubleup'

function tierOrder(tier: string | null): number {
  switch (tier) {
    case 'CHALLENGER': return 1
    case 'GRANDMASTER': return 2
    case 'MASTER': return 3
    case 'DIAMOND': return 4
    case 'EMERALD': return 5
    case 'PLATINUM': return 6
    case 'GOLD': return 7
    case 'SILVER': return 8
    case 'BRONZE': return 9
    case 'IRON': return 10
    default: return 999
  }
}

const getTierColor = (tier: string | null) => {
  if (!tier) return 'text-gray-500'
  const t = tier.toUpperCase()
  if (t.includes('CHALLENGER')) return 'text-yellow-500 font-bold'
  if (t.includes('GRANDMASTER')) return 'text-red-500 font-bold'
  if (t.includes('MASTER')) return 'text-purple-600 font-bold'
  if (t.includes('DIAMOND')) return 'text-blue-500 font-semibold'
  if (t.includes('EMERALD')) return 'text-emerald-500 font-semibold'
  if (t.includes('PLATINUM')) return 'text-cyan-500 font-semibold'
  if (t.includes('GOLD')) return 'text-amber-500'
  if (t.includes('SILVER')) return 'text-slate-500'
  if (t.includes('BRONZE')) return 'text-orange-600'
  if (t.includes('IRON')) return 'text-gray-600'
  return 'text-gray-500'
}

const getTierBadgeStyle = (tier: string | null) => {
  if (!tier) return 'bg-gray-100 text-gray-600'
  const t = tier.toUpperCase()
  if (t.includes('CHALLENGER')) return 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-lg shadow-yellow-200'
  if (t.includes('GRANDMASTER')) return 'bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-200'
  if (t.includes('MASTER')) return 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-200'
  if (t.includes('DIAMOND')) return 'bg-gradient-to-r from-blue-400 to-blue-600 text-white shadow-md shadow-blue-200'
  if (t.includes('EMERALD')) return 'bg-gradient-to-r from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-200'
  if (t.includes('PLATINUM')) return 'bg-gradient-to-r from-cyan-400 to-teal-500 text-white shadow-md shadow-cyan-200'
  if (t.includes('GOLD')) return 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white shadow-md shadow-amber-200'
  if (t.includes('SILVER')) return 'bg-gradient-to-r from-slate-300 to-slate-400 text-white'
  if (t.includes('BRONZE')) return 'bg-gradient-to-r from-orange-500 to-orange-600 text-white'
  if (t.includes('IRON')) return 'bg-gradient-to-r from-gray-500 to-gray-600 text-white'
  return 'bg-gray-100 text-gray-600'
}

const getRankBadge = (idx: number) => {
  if (idx === 0) return '🥇'
  if (idx === 1) return '🥈'
  if (idx === 2) return '🥉'
  return `#${idx + 1}`
}

function parseRecent5(raw: string | null | undefined): ('W' | 'L')[] {
  if (!raw) return []
  return raw
  .split(',')
  .map((s) => s.trim().toUpperCase())
  .filter((s) => s === 'W' || s === 'L') as ('W' | 'L')[]
}

function recent5WinRate(recent: ('W' | 'L')[]): number {
  if (recent.length === 0) return 0
  const wins = recent.filter((r) => r === 'W').length
  return Math.round((wins / recent.length) * 100)
}

function getQueueTierAndLp(m: Member, queue: QueueType) {
  if (queue === 'solo') {
    return {
      tier: m.tft_tier,
      rank: m.tft_rank,
      lp: m.tft_league_points ?? 0,
    }
  }
  return {
    tier: m.tft_doubleup_tier,
    rank: m.tft_doubleup_rank,
    lp: m.tft_doubleup_league_points ?? 0,
  }
}

export default function MemberRanking({ members }: { members: Member[] }) {
  const [queueType, setQueueType] = useState<QueueType>('solo')

  const sorted = useMemo(() => {
    const copy = [...members]
    copy.sort((a, b) => {
      const qa = getQueueTierAndLp(a, queueType)
      const qb = getQueueTierAndLp(b, queueType)

      const tierDiff = tierOrder(qa.tier) - tierOrder(qb.tier)
      if (tierDiff !== 0) return tierDiff

      return (qb.lp ?? 0) - (qa.lp ?? 0)
    })
    return copy
  }, [members, queueType])

  return (
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-200">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                롤체 컴퍼니 – 멤버 랭킹
              </h1>
              <p className="text-sm text-gray-600 mt-1">팀원들의 TFT 실력을 한눈에 확인하세요</p>
            </div>
          </div>

          {/* 탭 네비게이션 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1 inline-flex gap-1">
            <button
                type="button"
                onClick={() => setQueueType('solo')}
                className={
                    'px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ' +
                    (queueType === 'solo'
                        ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-md shadow-yellow-200'
                        : 'text-gray-600 hover:bg-gray-50')
                }
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
                솔로 랭크
              </div>
            </button>
            <button
                type="button"
                onClick={() => setQueueType('doubleup')}
                className={
                    'px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ' +
                    (queueType === 'doubleup'
                        ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-md shadow-yellow-200'
                        : 'text-gray-600 hover:bg-gray-50')
                }
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                더블업 랭크
              </div>
            </button>
          </div>
        </header>

        {/* 랭킹 카드 그리드 */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((m, idx) => {
            const recent = parseRecent5((m as any).tft_recent5)
            const winRate = recent5WinRate(recent)

            const { tier, rank, lp } = getQueueTierAndLp(m, queueType)
            const tierColor = getTierColor(tier)
            const tierBadgeStyle = getTierBadgeStyle(tier)

            return (
                <article
                    key={m.id}
                    className="group relative flex flex-col gap-4 rounded-2xl border-2 border-gray-200 bg-white p-5 shadow-sm hover:shadow-xl hover:border-gray-300 transition-all duration-300 hover:-translate-y-1"
                >
                  {/* 랭킹 배지 */}
                  <div className="absolute -top-3 -left-3 w-12 h-12 bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl flex items-center justify-center text-lg font-bold text-gray-700 shadow-md border-2 border-white">
                    {getRankBadge(idx)}
                  </div>

                  {/* 티어 배지 */}
                  <div className="flex justify-end">
                    <div className={`${tierBadgeStyle} px-4 py-2 rounded-xl text-sm font-bold transition-all`}>
                      <div className="text-center">
                        <div className="text-base">
                          {tier ?? 'UNRANKED'} {rank ?? ''}
                        </div>
                        <div className="text-xs opacity-90 mt-0.5">
                          {lp ?? 0} LP
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 멤버 정보 */}
                  <section className="space-y-3 mt-2">
                    <div className="bg-gradient-to-r from-gray-50 to-transparent rounded-lg p-3 border-l-4 border-blue-500">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd" />
                        </svg>
                        Riot ID
                      </div>
                      <div className="font-semibold text-gray-900">
                        {m.riot_game_name}<span className="text-gray-400">#{m.riot_tagline}</span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-r from-amber-50 to-transparent rounded-lg p-3 border-l-4 border-amber-500">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z" />
                          <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z" />
                        </svg>
                        단톡방 ID
                      </div>
                      <div className="font-semibold text-gray-900">
                        {m.member_name}
                      </div>
                    </div>
                  </section>

                  {/* 최근 전적 */}
                  <section className="mt-2 rounded-xl bg-gradient-to-br from-gray-50 to-gray-100 p-4 border border-gray-200">
                    <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold text-gray-700 flex items-center gap-2">
                    <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    최근 5판
                  </span>
                      <span className={`text-sm font-bold px-2.5 py-1 rounded-lg ${
                          winRate >= 60 ? 'bg-green-100 text-green-700' :
                              winRate >= 40 ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                      }`}>
                    승률 {winRate}%
                  </span>
                    </div>

                    {recent.length > 0 ? (
                        <div className="flex gap-1.5 justify-center">
                          {recent.map((result, i) => (
                              <div
                                  key={i}
                                  className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm shadow-sm ${
                                      result === 'W'
                                          ? 'bg-gradient-to-br from-green-400 to-green-500 text-white'
                                          : 'bg-gradient-to-br from-red-400 to-red-500 text-white'
                                  }`}
                              >
                                {result === 'W' ? '승' : '패'}
                              </div>
                          ))}
                        </div>
                    ) : (
                        <div className="text-center text-sm text-gray-500 py-2">
                          전적 정보 없음
                        </div>
                    )}
                  </section>
                </article>
            )
          })}
        </div>
      </div>
  )
}