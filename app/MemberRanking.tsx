'use client'

import {useMemo, useState} from 'react'
import type {Member} from '@/types/supabase'

type QueueType = 'solo' | 'doubleup'

function rankOrder(rank: string | null): number {
  if (!rank) return 999
  switch (rank) {
    case 'I': return 1
    case 'II': return 2
    case 'III': return 3
    case 'IV': return 4
    default: return 999
  }
}

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

const getTierImage = (tier: string | null) => {
  if (!tier) return "/images/unranked.png"
  const t = tier.toUpperCase()
  if (t.includes("CHALLENGER")) return "/images/challenger.png"
  if (t.includes("GRANDMASTER")) return "/images/grandmaster.png"
  if (t.includes("MASTER")) return "/images/master.png"
  if (t.includes("DIAMOND")) return "/images/diamond.png"
  if (t.includes("EMERALD")) return "/images/emerald.png"
  if (t.includes("PLATINUM")) return "/images/platinum.png"
  if (t.includes("GOLD")) return "/images/gold.png"
  if (t.includes("SILVER")) return "/images/silver.png"
  if (t.includes("BRONZE")) return "/images/bronze.png"
  if (t.includes("IRON")) return "/images/iron.png"
  return "/images/unranked.png"
}

const getTierBadgeStyle = (tier: string | null) => {
  if (!tier) return 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600'
  const t = tier.toUpperCase()
  if (t.includes('CHALLENGER')) return 'bg-gradient-to-br from-yellow-400 via-amber-400 to-amber-600 text-white shadow-lg shadow-yellow-300/50'
  if (t.includes('GRANDMASTER')) return 'bg-gradient-to-br from-red-500 via-rose-500 to-pink-600 text-white shadow-lg shadow-red-300/50'
  if (t.includes('MASTER')) return 'bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-300/50'
  if (t.includes('DIAMOND')) return 'bg-gradient-to-br from-blue-400 via-blue-500 to-blue-600 text-white shadow-lg shadow-blue-300/50'
  if (t.includes('EMERALD')) return 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-green-600 text-white shadow-lg shadow-emerald-300/50'
  if (t.includes('PLATINUM')) return 'bg-gradient-to-br from-cyan-400 via-teal-400 to-teal-600 text-white shadow-lg shadow-cyan-300/50'
  if (t.includes('GOLD')) return 'bg-gradient-to-br from-amber-400 via-yellow-500 to-yellow-600 text-white shadow-lg shadow-amber-300/50'
  if (t.includes('SILVER')) return 'bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 text-white shadow-md'
  if (t.includes('BRONZE')) return 'bg-gradient-to-br from-orange-500 via-orange-600 to-orange-700 text-white shadow-md'
  if (t.includes('IRON')) return 'bg-gradient-to-br from-gray-500 via-gray-600 to-gray-700 text-white shadow-md'
  return 'bg-gradient-to-br from-gray-100 to-gray-200 text-gray-600'
}

const getRankBadge = (idx: number) => {
  if (idx === 0) return { emoji: '🥇', bg: 'from-yellow-400 to-amber-500', shadow: 'shadow-yellow-300' }
  if (idx === 1) return { emoji: '🥈', bg: 'from-slate-300 to-slate-400', shadow: 'shadow-slate-300' }
  if (idx === 2) return { emoji: '🥉', bg: 'from-orange-400 to-orange-600', shadow: 'shadow-orange-300' }
  return { emoji: `#${idx + 1}`, bg: 'from-gray-200 to-gray-300', shadow: 'shadow-gray-200' }
}

function parseRecent5(raw: string | null | undefined): number[] {
  if (!raw) return []
  return raw
  .split(',')
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 1 && n <= 8)
}

function recent5WinRate(placements: number[]): number {
  if (placements.length === 0) return 0
  const wins = placements.filter((p) => p >= 1 && p <= 4).length
  return Math.round((wins / placements.length) * 100)
}

function getPlacementStyle(p: number): string {
  if (p === 1) return 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white shadow-md shadow-yellow-200'
  if (p >= 2 && p <= 4) return 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-md shadow-green-200'
  return 'bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-sm'
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

export default function MemberRanking({members}: { members: Member[] }) {
  const [queueType, setQueueType] = useState<QueueType>('solo')

  const sorted = useMemo(() => {
    const candidates = members.filter((m) => {
      const { tier } = getQueueTierAndLp(m, queueType)
      return tier !== null
    })

    const copy = [...candidates]
    copy.sort((a, b) => {
      const qa = getQueueTierAndLp(a, queueType)
      const qb = getQueueTierAndLp(b, queueType)

      const tierDiff = tierOrder(qa.tier) - tierOrder(qb.tier)
      if (tierDiff !== 0) return tierDiff

      const rankDiff = rankOrder(qa.rank ?? null) - rankOrder(qb.rank ?? null)
      if (rankDiff !== 0) return rankDiff

      return (qb.lp ?? 0) - (qa.lp ?? 0)
    })

    return copy
  }, [members, queueType])

  return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* 헤더 */}
          <header className="mb-10">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 via-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-xl shadow-yellow-300/30 ring-4 ring-white">
                <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
              </div>
              <div className="flex-1">
                <h1 className="text-4xl font-black bg-gradient-to-r from-slate-800 via-slate-700 to-slate-600 bg-clip-text text-transparent leading-tight">
                  롤체 컴퍼니
                </h1>
                <p className="text-base text-slate-600 mt-2 font-medium">우리 멤버들의 순위</p>
              </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-white/50 p-1.5 inline-flex gap-1.5">
              <button
                  type="button"
                  onClick={() => setQueueType('solo')}
                  className={
                      'px-8 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ' +
                      (queueType === 'solo'
                          ? 'bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 text-white shadow-lg shadow-yellow-300/50 scale-105'
                          : 'text-slate-600 hover:bg-slate-50/80')
                  }
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd"/>
                  </svg>
                  솔로 랭크
                </div>
              </button>
              <button
                  type="button"
                  onClick={() => setQueueType('doubleup')}
                  className={
                      'px-8 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ' +
                      (queueType === 'doubleup'
                          ? 'bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 text-white shadow-lg shadow-yellow-300/50 scale-105'
                          : 'text-slate-600 hover:bg-slate-50/80')
                  }
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                  </svg>
                  더블업 랭크
                </div>
              </button>
            </div>
          </header>

          {/* 랭킹 카드 그리드 */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            {sorted.map((m, idx) => {
              const placements = parseRecent5((m as any).tft_recent5)
              const winRate = recent5WinRate(placements)
              const {tier, rank, lp} = getQueueTierAndLp(m, queueType)
              const tierBadgeStyle = getTierBadgeStyle(tier)
              const rankBadge = getRankBadge(idx)

              return (
                  <article
                      key={m.id}
                      className="group relative flex flex-col rounded-3xl border-2 border-white/50 bg-white/90 backdrop-blur-sm p-6 shadow-xl hover:shadow-2xl transition-all duration-500 hover:-translate-y-2 hover:border-yellow-300/50"
                  >
                    {/* 랭킹 배지 */}
                    <div className={`absolute -top-4 -left-4 w-14 h-14 bg-gradient-to-br ${rankBadge.bg} rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-xl ${rankBadge.shadow} ring-4 ring-white transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}>
                      {rankBadge.emoji}
                    </div>

                    {/* 티어 섹션 */}
                    <div className="flex justify-end mb-5">
                      <div className="flex items-center gap-3">
                        {/* 티어 이미지 */}
                        <div className="w-14 h-14 bg-gradient-to-br from-white to-slate-50 rounded-xl flex items-center justify-center shadow-lg border-2 border-slate-100 overflow-hidden transition-transform duration-300 group-hover:scale-110">
                          <img
                              src={getTierImage(tier)}
                              alt={tier ?? 'UNRANKED'}
                              className="w-full h-full object-contain p-1"
                          />
                        </div>

                        {/* 티어 배지 */}
                        <div className={`${tierBadgeStyle} px-5 py-3 rounded-xl text-sm font-black transition-all duration-300 group-hover:scale-105`}>
                          <div className="text-center">
                            <div className="text-base leading-tight">
                              {tier ?? 'UNRANKED'}
                            </div>
                            {rank && <div className="text-xs opacity-90">{rank}</div>}
                            <div className="text-xs opacity-90 mt-1 font-semibold">
                              {lp} LP
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 멤버 정보 */}
                    <section className="space-y-3 mb-4">
                      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-blue-50 via-blue-50 to-transparent p-4 border-l-4 border-blue-500 shadow-sm">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-blue-100/30 rounded-full -mr-10 -mt-10"></div>
                        <div className="relative">
                          <div className="text-xs font-semibold text-blue-600 mb-1.5 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-6-3a2 2 0 11-4 0 2 2 0 014 0zm-2 4a5 5 0 00-4.546 2.916A5.986 5.986 0 0010 16a5.986 5.986 0 004.546-2.084A5 5 0 0010 11z" clipRule="evenodd"/>
                            </svg>
                            Riot ID
                          </div>
                          <div className="font-bold text-slate-900 text-sm">
                            {m.riot_game_name}<span className="text-slate-400">#{m.riot_tagline}</span>
                          </div>
                        </div>
                      </div>

                      <div className="relative overflow-hidden rounded-xl bg-gradient-to-r from-amber-50 via-amber-50 to-transparent p-4 border-l-4 border-amber-500 shadow-sm">
                        <div className="absolute top-0 right-0 w-20 h-20 bg-amber-100/30 rounded-full -mr-10 -mt-10"></div>
                        <div className="relative">
                          <div className="text-xs font-semibold text-amber-600 mb-1.5 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2 5a2 2 0 012-2h7a2 2 0 012 2v4a2 2 0 01-2 2H9l-3 3v-3H4a2 2 0 01-2-2V5z"/>
                              <path d="M15 7v2a4 4 0 01-4 4H9.828l-1.766 1.767c.28.149.599.233.938.233h2l3 3v-3h2a2 2 0 002-2V9a2 2 0 00-2-2h-1z"/>
                            </svg>
                            단톡방 ID
                          </div>
                          <div className="font-bold text-slate-900 text-sm">
                            {m.member_name}
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* 최근 전적 */}
                    <section className="mt-auto rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/50 p-5 border border-slate-200/50 shadow-inner">
                      <div className="mb-4 flex items-center justify-between">
                    <span className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                      <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                      </svg>
                      최근 5판
                    </span>
                        <span className={`text-xs font-black px-3 py-1.5 rounded-full ${
                            winRate >= 60
                                ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white shadow-md shadow-green-200'
                                : winRate >= 40
                                    ? 'bg-gradient-to-r from-yellow-400 to-amber-500 text-white shadow-md shadow-yellow-200'
                                    : 'bg-gradient-to-r from-red-400 to-rose-500 text-white shadow-md shadow-red-200'
                        }`}>
                      {winRate}%
                    </span>
                      </div>

                      {placements.length > 0 ? (
                          <div className="flex gap-2">
                            {placements.map((p, i) => (
                                <div
                                    key={i}
                                    className={`flex-1 h-14 rounded-xl flex flex-col items-center justify-center font-black text-xs ${getPlacementStyle(p)} transition-transform duration-200 hover:scale-110`}
                                >
                                  <div className="text-lg leading-none">{p}</div>
                                  <div className="text-[10px] opacity-90 mt-0.5">위</div>
                                </div>
                            ))}
                          </div>
                      ) : (
                          <div className="text-center text-sm text-slate-400 py-4 font-medium">
                            전적 정보 없음
                          </div>
                      )}
                    </section>
                  </article>
              )
            })}
          </div>
        </div>
      </div>
  )
}