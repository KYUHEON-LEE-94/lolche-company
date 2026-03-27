'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabaseClient } from '@/lib/supabase'
import type { Member } from '@/types/supabase'
import AuthButtons from '@/app/components/AuthButtons'
import Image from 'next/image'

type QueueType = 'solo' | 'doubleup'

type Season = {
  id: number
  season_name: string
  set_number: number
  is_active: boolean
}

const MIN_SYNC_INTERVAL_SEC = Number(process.env.NEXT_PUBLIC_MIN_SYNC_INTERVAL_SEC ?? '300')

// ─── 유틸 ────────────────────────────────────────────────────────────────────

function formatAgo(ms: number) {
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return `${sec}초 전`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.floor(min / 60)
  return `${hr}시간 전`
}

function formatRemain(sec: number) {
  if (sec <= 0) return '지금 가능'
  if (sec < 60) return `${sec}초 후`
  return `${Math.ceil(sec / 60)}분 후`
}

function calcRemainSec(
    lastSyncedAt: string | null | undefined,
    cooldownSec: number,
    nowMs: number,
) {
  if (!lastSyncedAt) return 0
  const diff = Math.floor((nowMs - new Date(lastSyncedAt).getTime()) / 1000)
  return Math.max(0, cooldownSec - diff)
}

function getProfileImageUrl(path: string | null) {
  if (!path) return null
  const { data } = supabaseClient.storage.from('profile-images').getPublicUrl(path)
  return data.publicUrl
}

function getFramePublicUrl(framePath: string) {
  const { data } = supabaseClient.storage.from('profile-frames').getPublicUrl(framePath)
  return data.publicUrl
}

// ─── 티어 헬퍼 ───────────────────────────────────────────────────────────────

function rankOrder(rank: string | null): number {
  const map: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4 }
  return rank ? (map[rank] ?? 999) : 999
}

function tierOrder(tier: string | null): number {
  const map: Record<string, number> = {
    CHALLENGER: 1, GRANDMASTER: 2, MASTER: 3,
    DIAMOND: 4, EMERALD: 5, PLATINUM: 6,
    GOLD: 7, SILVER: 8, BRONZE: 9, IRON: 10,
  }
  return tier ? (map[tier] ?? 999) : 999
}

function getQueueTierAndLp(m: Member, queue: QueueType) {
  if (queue === 'solo') {
    return { tier: m.tft_tier, rank: m.tft_rank, lp: m.tft_league_points ?? 0 }
  }
  return {
    tier: m.tft_doubleup_tier,
    rank: m.tft_doubleup_rank,
    lp: m.tft_doubleup_league_points ?? 0,
  }
}

// ─── 티어별 스타일 맵 ─────────────────────────────────────────────────────────

const TIER_STYLES: Record<
    string,
    { strip: string; text: string; glow: string; badge: string; icon: string }
> = {
  CHALLENGER:  { strip: 'from-yellow-400 to-amber-500',  text: 'text-yellow-400',  glow: 'hover:shadow-yellow-500/20  hover:border-yellow-500/25',  badge: 'bg-yellow-400/10 text-yellow-300 border-yellow-500/20',  icon: '👑' },
  GRANDMASTER: { strip: 'from-red-500 to-rose-600',      text: 'text-red-400',     glow: 'hover:shadow-red-500/20    hover:border-red-500/25',      badge: 'bg-red-500/10   text-red-300   border-red-500/20',      icon: '♦' },
  MASTER:      { strip: 'from-purple-500 to-violet-600', text: 'text-purple-400',  glow: 'hover:shadow-purple-500/20 hover:border-purple-500/25',  badge: 'bg-purple-500/10 text-purple-300 border-purple-500/20', icon: '◆' },
  DIAMOND:     { strip: 'from-blue-400 to-blue-600',     text: 'text-blue-400',    glow: 'hover:shadow-blue-500/20   hover:border-blue-500/25',    badge: 'bg-blue-500/10   text-blue-300   border-blue-500/20',    icon: '◇' },
  EMERALD:     { strip: 'from-emerald-400 to-emerald-600',text:'text-emerald-400', glow: 'hover:shadow-emerald-500/20 hover:border-emerald-500/25',badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',icon: '◈' },
  PLATINUM:    { strip: 'from-cyan-400 to-teal-500',     text: 'text-cyan-400',    glow: 'hover:shadow-cyan-500/20   hover:border-cyan-500/25',    badge: 'bg-cyan-500/10   text-cyan-300   border-cyan-500/20',    icon: '◉' },
  GOLD:        { strip: 'from-amber-400 to-yellow-500',  text: 'text-amber-400',   glow: 'hover:shadow-amber-500/20  hover:border-amber-500/25',   badge: 'bg-amber-500/10  text-amber-300  border-amber-500/20',   icon: '○' },
  SILVER:      { strip: 'from-slate-400 to-slate-500',   text: 'text-slate-400',   glow: 'hover:shadow-slate-400/20  hover:border-slate-400/25',   badge: 'bg-slate-400/10  text-slate-300  border-slate-400/20',   icon: '○' },
  BRONZE:      { strip: 'from-orange-500 to-orange-700', text: 'text-orange-400',  glow: 'hover:shadow-orange-500/20 hover:border-orange-500/25',  badge: 'bg-orange-500/10 text-orange-300 border-orange-500/20', icon: '○' },
  IRON:        { strip: 'from-gray-500 to-gray-600',     text: 'text-gray-400',    glow: 'hover:shadow-gray-500/20   hover:border-gray-500/25',    badge: 'bg-gray-500/10   text-gray-300   border-gray-500/20',    icon: '◌' },
}

const FALLBACK_STYLE = {
  strip: 'from-slate-600 to-slate-700',
  text: 'text-slate-400',
  glow: '',
  badge: 'bg-slate-700/50 text-slate-400 border-slate-600/30',
  icon: '?',
}

function getTierStyle(tier: string | null) {
  return (tier && TIER_STYLES[tier.toUpperCase()]) ? TIER_STYLES[tier.toUpperCase()] : FALLBACK_STYLE
}

// ─── 랭킹 배지 ───────────────────────────────────────────────────────────────

function RankBadge({ idx }: { idx: number }) {
  if (idx === 0)
    return (
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg shadow-yellow-500/40 text-sm">
          🥇
        </div>
    )
  if (idx === 1)
    return (
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-slate-300 to-slate-400 shadow-lg shadow-slate-400/30 text-sm">
          🥈
        </div>
    )
  if (idx === 2)
    return (
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-orange-400 to-orange-600 shadow-lg shadow-orange-500/30 text-sm">
          🥉
        </div>
    )
  return (
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/5 border border-white/8 text-xs font-bold text-slate-400">
        #{idx + 1}
      </div>
  )
}

// ─── 동기화 버튼 ─────────────────────────────────────────────────────────────

function SyncButton({
                      memberId,
                      remainSec,
                      isSyncing,
                      onSync,
                    }: {
  memberId: string
  remainSec: number
  isSyncing: boolean
  onSync: () => void
}) {
  const disabled = isSyncing || remainSec > 0

  return (
      <button
          type="button"
          onClick={onSync}
          disabled={disabled}
          title={remainSec > 0 ? `쿨다운 중 · ${formatRemain(remainSec)}` : '동기화'}
          className="
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold
        bg-indigo-500/10 border border-indigo-500/25 text-indigo-400
        hover:bg-indigo-500/20 hover:text-indigo-300 transition-all duration-200
        disabled:opacity-40 disabled:cursor-not-allowed
      "
      >
        {isSyncing ? (
            <>
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              동기화 중
            </>
        ) : (
            <>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                <path d="M4 4v5h5M20 20v-5h-5M4.582 9a8 8 0 0115.356 4M19.418 15a8 8 0 01-15.356-4" />
              </svg>
              {remainSec > 0 ? formatRemain(remainSec) : '동기화'}
            </>
        )}
      </button>
  )
}

// ─── 멤버 카드 ───────────────────────────────────────────────────────────────

function MemberCard({
                      member,
                      idx,
                      queue,
                      isSyncing,
                      syncMsg,
                      effectiveLastSyncedAt,
                      nowMs,
                      onSync,
                    }: {
  member: Member
  idx: number
  queue: QueueType
  isSyncing: boolean
  syncMsg: string
  effectiveLastSyncedAt: string | null | undefined
  nowMs: number
  onSync: () => void
}) {
  const { tier, rank, lp } = getQueueTierAndLp(member, queue)
  const style = getTierStyle(tier)
  const remainSec = calcRemainSec(effectiveLastSyncedAt, MIN_SYNC_INTERVAL_SEC, nowMs)

  const profileUrl = getProfileImageUrl(member.profile_image_path)
  const framePath = member.profile_frame_path

  return (
      <article
          className={`
        group relative flex flex-col rounded-2xl
        bg-[#0d1117] border border-white/[0.06]
        overflow-hidden
        transition-all duration-300
        hover:-translate-y-1 hover:shadow-2xl
        ${style.glow}
      `}
      >
        {/* 티어 컬러 스트립 */}
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] bg-gradient-to-b ${style.strip}`} />

        {/* 배경 랭크 숫자 */}
        <span
            className="
          pointer-events-none select-none absolute -right-2 top-3
          text-[72px] font-black leading-none
          text-white/[0.03] tracking-tight tabular-nums
        "
        >
        {String(idx + 1).padStart(2, '0')}
      </span>

        <div className="relative p-5 pl-6 flex flex-col gap-4">

          {/* 상단: 랭킹 배지 */}
          <div className="flex items-start justify-between">
            <RankBadge idx={idx} />
            {/* 티어 아이콘 배지 */}
            {tier && (
                <span className={`text-[10px] font-black tracking-widest px-2 py-1 rounded-md border ${style.badge}`}>
              {tier}
            </span>
            )}
          </div>

          {/* 프로필 */}
          <div className="flex items-center gap-3">
            {/* 아바타 */}
            <div className="relative w-[52px] h-[52px] flex-shrink-0">
              {framePath && (
                  <div className="absolute -inset-9 z-20 pointer-events-none">
                    <Image
                        src={getFramePublicUrl(framePath)}
                        alt="profile frame"
                        fill
                        sizes="140px"
                        className="object-contain"
                    />
                  </div>
              )}
              <div className="
              relative z-10 w-full h-full rounded-xl overflow-hidden
              bg-gradient-to-br from-slate-700 to-slate-800
              border border-white/10
              flex items-center justify-center
            ">
                {profileUrl ? (
                    <Image src={profileUrl} alt={`${member.member_name} 프로필`} fill sizes="52px" className="object-cover" />
                ) : (
                    <svg className="w-6 h-6 text-slate-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                )}
              </div>
            </div>

            {/* 이름 정보 */}
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mb-0.5">카카오 ID</p>
              <p className="font-bold text-white text-[15px] leading-tight truncate">{member.member_name}</p>
              <p className="text-[12px] text-slate-500 mt-0.5 truncate">
                {member.riot_game_name}
                <span className="text-slate-600">#{member.riot_tagline}</span>
              </p>
            </div>
          </div>

          {/* 구분선 */}
          <div className="h-px bg-white/[0.05]" />

          {/* 티어 + LP */}
          <div className="flex items-center gap-3">
            {/* 티어 아이콘 */}
            <span className={`text-3xl leading-none ${style.text} drop-shadow-sm`}>
            {style.icon}
          </span>

            <div className="flex-1">
              <p className={`text-xl font-black leading-tight tracking-wide ${style.text}`}>
                {tier ?? 'UNRANKED'}
              </p>
              <p className="text-[11px] font-bold text-slate-500 tracking-widest">
                {rank ? `${rank} · DIVISION` : 'NO RANK'}
              </p>
            </div>

            {/* LP 배지 */}
            <div className="text-right bg-white/[0.04] border border-white/[0.07] rounded-xl px-3 py-2">
              <p className="text-lg font-black text-white leading-none tabular-nums">{lp}</p>
              <p className="text-[10px] font-bold text-slate-500 tracking-widest mt-0.5">LP</p>
            </div>
          </div>

          {/* 구분선 */}
          <div className="h-px bg-white/[0.05]" />

          {/* 동기화 영역 */}
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] text-slate-600 leading-snug">
              {effectiveLastSyncedAt ? (
                  <>
                    최근{' '}
                    <span className="text-slate-400 font-semibold">
                  {formatAgo(nowMs - new Date(effectiveLastSyncedAt).getTime())}
                </span>
                  </>
              ) : (
                  <span>동기화 기록 없음</span>
              )}
              {syncMsg && (
                  <span className="block mt-0.5 text-amber-400">{syncMsg}</span>
              )}
            </div>

            <SyncButton
                memberId={member.id}
                remainSec={remainSec}
                isSyncing={isSyncing}
                onSync={onSync}
            />
          </div>
        </div>
      </article>
  )
}

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export default function MemberRanking({
                                        members = [],
                                        currentSeason,
                                      }: {
  members?: Member[]
  currentSeason?: Season | null
}) {
  const [queueType, setQueueType] = useState<QueueType>('solo')

  // auth
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)

  // sync
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [syncMsgById, setSyncMsgById] = useState<Record<string, string>>({})
  const [localLastSynced, setLocalLastSynced] = useState<Record<string, string | null>>({})
  const [nowMs, setNowMs] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  // auth session
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
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    else { setEmail(''); setPassword('') }
    setAuthLoading(false)
  }

  const handleLogout = async () => {
    setAuthLoading(true)
    await supabaseClient.auth.signOut()
    setAuthLoading(false)
  }

  // 동기화
  const handleSyncOne = async (id: string) => {
    if (syncingId) return
    setSyncingId(id)
    setSyncMsgById((prev) => ({ ...prev, [id]: '' }))
    try {
      const res = await fetch(`/api/members/${id}/sync`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || body?.ok === false) {
        const msg = res.status === 429
            ? '요청이 많아서(429) 잠시 후 다시 시도해주세요.'
            : body?.error ?? `동기화 실패 (status: ${res.status})`
        setSyncMsgById((prev) => ({ ...prev, [id]: msg }))
        return
      }
      if (body?.skipped) {
        const s = body?.nextAllowedInSec ?? 0
        setSyncMsgById((prev) => ({ ...prev, [id]: `이미 최신 · ${formatRemain(s)}` }))
        return
      }
      const iso = new Date().toISOString()
      setLocalLastSynced((prev) => ({ ...prev, [id]: iso }))
      setSyncMsgById((prev) => ({ ...prev, [id]: '동기화 완료!' }))
    } catch (e) {
      console.error(e)
      setSyncMsgById((prev) => ({ ...prev, [id]: '동기화 중 오류가 발생했습니다.' }))
    } finally {
      setSyncingId(null)
    }
  }

  // 정렬
  const sorted = useMemo(() => {
    if (!members.length) return []
    return [...members]
        .filter((m) => getQueueTierAndLp(m, queueType).tier !== null)
        .sort((a, b) => {
          const qa = getQueueTierAndLp(a, queueType)
          const qb = getQueueTierAndLp(b, queueType)
          const tierDiff = tierOrder(qa.tier) - tierOrder(qb.tier)
          if (tierDiff !== 0) return tierDiff
          const rankDiff = rankOrder(qa.rank ?? null) - rankOrder(qb.rank ?? null)
          if (rankDiff !== 0) return rankDiff
          return (qb.lp ?? 0) - (qa.lp ?? 0)
        })
  }, [members, queueType])

  // ─── 렌더 ────────────────────────────────────────────────────────────────

  return (
      <div
          className="min-h-screen"
          style={{
            backgroundImage: 'url(/images/background/background1.png)',
            backgroundRepeat: 'no-repeat',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
          }}
      >
        {/* 다크 오버레이 */}
        <div className="min-h-screen bg-[#07090f]/85 backdrop-blur-sm px-4 py-8">
          <div className="max-w-6xl mx-auto">

            {/* auth 버튼 */}
            <div className="flex justify-end mb-6">
              <AuthButtons />
            </div>

            {/* ── 헤더 ── */}
            <header className="text-center mb-12">

              {/* 시즌 */}
              <div className="mb-6">
                {currentSeason ? (
                    <>
                      <div className="inline-flex items-center gap-3 mb-2">
                        <div className="h-px w-10 bg-gradient-to-r from-transparent to-amber-500/50" />
                        <span className="text-[10px] font-black tracking-[0.4em] text-amber-500 uppercase">
                      Now Playing
                    </span>
                        <div className="h-px w-10 bg-gradient-to-l from-transparent to-amber-500/50" />
                      </div>
                      <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white leading-tight">
                        {currentSeason.season_name}
                      </h1>
                      <p className="mt-1 text-sm font-bold text-amber-500 tracking-[0.2em]">
                        SET {currentSeason.set_number}
                      </p>
                    </>
                ) : (
                    <span className="text-slate-500 font-bold tracking-widest uppercase text-xs">
                  No Active Season
                </span>
                )}
              </div>

              {/* 로고 */}
              <div className="flex justify-center mb-8">
                <div className="relative group w-full max-w-[320px]">
                  {/* glow */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-cyan-500/30 via-indigo-500/30 to-purple-600/30 blur-xl opacity-50 group-hover:opacity-70 transition-opacity duration-500" />
                  <div className="relative h-[68px] rounded-2xl bg-[#0d1117] border border-white/10 overflow-hidden flex items-center justify-center px-6">
                    {/* 상단 하이라이트 */}
                    <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    <img
                        src="/images/logo.png"
                        alt="롤체 컴퍼니 로고"
                        className="max-h-[48px] w-auto object-contain drop-shadow-[0_0_12px_rgba(99,102,241,0.5)] group-hover:drop-shadow-[0_0_20px_rgba(99,102,241,0.7)] transition-all duration-300"
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  </div>
                </div>
              </div>

              {/* 큐 탭 */}
              <div className="inline-flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.07]">
                {(['solo', 'doubleup'] as const).map((q) => (
                    <button
                        key={q}
                        type="button"
                        onClick={() => setQueueType(q)}
                        className={`
                    flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-200
                    ${queueType === q
                            ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-[#1a0a00] shadow-lg shadow-amber-500/30'
                            : 'text-slate-400 hover:text-slate-200'
                        }
                  `}
                    >
                      {q === 'solo' ? (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                      ) : (
                          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                          </svg>
                      )}
                      {q === 'solo' ? '솔로 랭크' : '더블업 랭크'}
                    </button>
                ))}
              </div>
            </header>

            {/* ── 랭킹 그리드 ── */}
            {sorted.length === 0 ? (
                <div className="text-center py-20 text-slate-600 font-medium">
                  랭킹 데이터가 없습니다.
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sorted.map((m, idx) => {
                    const effectiveLastSyncedAt = (localLastSynced[m.id] ?? (m as any).last_synced_at) as
                        | string | null | undefined
                    return (
                        <MemberCard
                            key={m.id}
                            member={m}
                            idx={idx}
                            queue={queueType}
                            isSyncing={syncingId === m.id}
                            syncMsg={syncMsgById[m.id] ?? ''}
                            effectiveLastSyncedAt={effectiveLastSyncedAt}
                            nowMs={nowMs}
                            onSync={() => handleSyncOne(m.id)}
                        />
                    )
                  })}
                </div>
            )}

          </div>
        </div>
      </div>
  )
}