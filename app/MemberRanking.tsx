'use client'

import {useEffect, useMemo, useState} from 'react'
import { supabaseClient } from '@/lib/supabase'
import AuthButtons from "@/app/components/AuthButtons";
import TierPanel from '@/app/components/TierPanel'

type Member = {
  id: string
  riot_game_name: string
  riot_tagline: string
  member_name: string
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_league_points: number | null
  tft_recent5: string | null
}

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
  if (t.includes("CHALLENGER")) return "/images/tier/challenger.png"
  if (t.includes("GRANDMASTER")) return "/images/tier/grandmaster.png"
  if (t.includes("MASTER")) return "/images/tier/master.png"
  if (t.includes("DIAMOND")) return "/images/tier/diamond.png"
  if (t.includes("EMERALD")) return "/images/tier/emerald.png"
  if (t.includes("PLATINUM")) return "/images/tier/platinum.png"
  if (t.includes("GOLD")) return "/images/tier/gold.png"
  if (t.includes("SILVER")) return "/images/tier/silver.png"
  if (t.includes("BRONZE")) return "/images/tier/bronze.png"
  if (t.includes("IRON")) return "/images/tier/iron.png"
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
  if (idx === 0) {
    return {
      image: '/images/rank/rank1.png',
      bg: 'from-yellow-400 to-amber-500',
      shadow: 'shadow-yellow-300'
    }
  }
  if (idx === 1) {
    return {
      image: '/images/rank/rank2.png',
      bg: 'from-slate-300 to-slate-400',
      shadow: 'shadow-slate-300'
    }
  }
  if (idx === 2) {
    return {
      image: '/images/rank/rank3.png',
      bg: 'from-orange-400 to-orange-600',
      shadow: 'shadow-orange-300'
    }
  }
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

export default function MemberRanking({members = []}: { members?: Member[] }) {
  const [queueType, setQueueType] = useState<QueueType>('solo')
  // ✅ auth state
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data } = await supabaseClient.auth.getSession()
      if (!mounted) return

      setUserEmail(data.session?.user?.email ?? null)
      setAuthLoading(false)
    })()

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthLoading(true)

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setAuthError(error.message)
    } else {
      setEmail('')
      setPassword('')
    }
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    setAuthLoading(true)
    await supabaseClient.auth.signOut()
    setAuthLoading(false)
  }

  const sorted = useMemo(() => {
    if (!members || members.length === 0) return []

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
      <div
          className="min-h-screen px-4 py-8 relative"
          style={{
            backgroundImage: "url(/images/background/background1.png)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundAttachment: "fixed",
          }}
      >
        <div className="max-w-7xl mx-auto">

          <AuthButtons/>
          {/* 헤더 */}
          <header className="mb-10">
            <div className="flex items-center gap-6 mb-8">
              {/* 로고 */}
              <div className="relative group flex justify-center">
                {/* 뒤 Glow */}
                <div
                    className="absolute inset-0 w-[380px] h-24 bg-gradient-to-r from-yellow-400 via-amber-500 to-orange-500 rounded-3xl blur-3xl opacity-40 group-hover:opacity-60 transition-opacity"
                ></div>

                {/* 로고 컨테이너 */}
                <div
                    className="relative w-[380px] h-24 bg-black rounded-3xl px-6 pt-[5px] ring-4 ring-amber-500/30 shadow-2xl shadow-amber-500/30 group-hover:scale-105 transition-transform duration-300"
                >
                  <img
                      src="/images/logo.png"
                      alt="롤체 컴퍼니 로고"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none'
                        e.currentTarget.parentElement!.innerHTML = `
<svg viewBox="0 0 400 120" class="w-full h-full">
  <defs>
    <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#fbbf24"/>
      <stop offset="100%" style="stop-color:#f59e0b"/>
    </linearGradient>
  </defs>
  <rect x="10" y="20" width="380" height="80" rx="16" fill="none" stroke="url(#gold-gradient)" stroke-width="8" />
</svg>
`
                      }}
                  />
                </div>
              </div>

            </div>

            {/* 탭 네비게이션 */}
            <div
                className="bg-slate-800/60 backdrop-blur-sm rounded-2xl shadow-xl border border-slate-700/50 p-1.5 inline-flex gap-1.5">
              <button
                  type="button"
                  onClick={() => setQueueType('solo')}
                  className={
                      'px-8 py-3.5 rounded-xl text-sm font-bold transition-all duration-300 ' +
                      (queueType === 'solo'
                          ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black shadow-lg shadow-amber-500/50 scale-105'
                          : 'text-slate-300 hover:bg-slate-700/50')
                  }
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                          clipRule="evenodd"/>
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
                          ? 'bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black shadow-lg shadow-amber-500/50 scale-105'
                          : 'text-slate-300 hover:bg-slate-700/50')
                  }
              >
                <div className="flex items-center gap-2.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                        d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/>
                  </svg>
                  더블업 랭크
                </div>
              </button>
            </div>
          </header>

          {/* 랭킹 카드 그리드 */}
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
            {sorted.map((m, idx) => {
              const placements = parseRecent5(m.tft_recent5)
              const winRate = recent5WinRate(placements)
              const {tier, rank, lp} = getQueueTierAndLp(m, queueType)
              const tierBadgeStyle = getTierBadgeStyle(tier)
              const rankBadge = getRankBadge(idx)

              return (
                  <article
                      key={m.id}
                      className="group relative flex flex-col rounded-3xl border-2 border-slate-700/50 bg-slate-800/90 backdrop-blur-sm p-6 shadow-xl hover:shadow-2xl hover:shadow-amber-500/20 transition-all duration-500 hover:-translate-y-2 hover:border-amber-500/50"
                  >
                    {/* 랭킹 배지 */}
                    <div
                        className={`absolute -top-4 -left-4 w-14 h-14 bg-gradient-to-br ${rankBadge.bg} rounded-2xl flex items-center justify-center text-xl font-black text-white shadow-xl ${rankBadge.shadow} ring-4 ring-slate-800 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6`}>
                      {rankBadge.image ? (
                          <img
                              src={rankBadge.image}
                              alt={`rank-${idx}`}
                              className="w-10 h-10 object-contain"
                          />
                      ) : (
                          <span className="text-sm font-bold text-gray-700">{rankBadge.emoji}</span>
                      )}
                    </div>

                    {/* 상단: 프로필 + 정보 */}
                    <div className="flex gap-4 mb-5">
                      {/* 좌측: 프로필 사진 */}
                      <div className="flex-shrink-0">
                        <div
                            className="w-24 h-24 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center border-4 border-slate-600 shadow-lg overflow-hidden">
                          <svg className="w-12 h-12 text-slate-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                                  clipRule="evenodd"/>
                          </svg>
                        </div>
                      </div>

                      {/* 우측: 카톡ID + RIOT ID */}
                      <div className="flex-1 flex flex-col justify-center space-y-2">
                        <div className="bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600">
                          <div className="text-xs text-slate-400 mb-0.5">카톡 ID</div>
                          <div className="font-bold text-white text-sm">{m.member_name}</div>
                        </div>
                        <div className="bg-slate-700/50 rounded-lg px-3 py-2 border border-slate-600">
                          <div className="text-xs text-slate-400 mb-0.5">RIOT ID</div>
                          <div className="font-bold text-white text-sm">
                            {m.riot_game_name}<span className="text-slate-400">#{m.riot_tagline}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 티어 정보 섹션 */}
                    <TierPanel
                        tier={tier}
                        rank={rank}
                        lp={lp ?? 0}
                        getTierImage={getTierImage}
                        getTierBadgeStyle={getTierBadgeStyle}
                    />
                  </article>
              )
            })}
          </div>
        </div>
      </div>
  )
}