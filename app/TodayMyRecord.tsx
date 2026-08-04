'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { CARD } from '@/lib/ui/styles'
import type { DashRankMember } from '@/app/DashboardRankSections'

const DashboardMemberPanel = dynamic(
  () => import('@/app/components/ranking/DashboardMemberPanel'),
  { ssr: false },
)

type ReadyDashboard = {
  state: 'ready'
  member: { id: string; memberName: string; avatarUrl: string | null; lastSyncedAt: string | null }
  tft: {
    position: number | null
    label: string
    tier: string | null
    rank: string | null
    lp: number | null
    delta: number | null
    weeklyBest: string | null
  }
  lol: { position: number | null; label: string } | null
  recentMatches: Array<{ id: string; playedAt: string | null; placement: number | null }>
}

function formatSyncedAt(value: string | null) {
  if (!value) return '동기화 기록 없음'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '동기화 기록 없음'
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul',
  }).format(date)
}

export default function TodayMyRecord() {
  const [data, setData] = useState<ReadyDashboard | null>(null)
  const [selected, setSelected] = useState<DashRankMember | null>(null)
  const [panelMounted, setPanelMounted] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch('/api/me/dashboard', { cache: 'no-store', signal: controller.signal })
        if (response.status === 401 || !response.ok) return
        const body: unknown = await response.json()
        if (body && typeof body === 'object' && 'state' in body && body.state === 'ready') {
          setData(body as ReadyDashboard)
        }
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
        console.error(e instanceof Error ? e.message : '개인 기록을 불러오지 못했습니다.')
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  if (!data) return null

  const detailMember: DashRankMember = {
    id: data.member.id,
    member_name: data.member.memberName,
    tft_tier: data.tft.tier,
    tft_rank: data.tft.rank,
    tft_league_points: data.tft.lp,
    avatarUrl: data.member.avatarUrl,
    rankLabel: data.tft.label,
  }

  const openDetail = () => {
    setPanelMounted(true)
    setSelected(detailMember)
  }

  return (
    <section className={`${CARD} mb-8 overflow-hidden`}>
      <div className="flex flex-col gap-5 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {data.member.avatarUrl ? (
              <Image src={data.member.avatarUrl} alt="" width={44} height={44} className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <span className="h-11 w-11 rounded-full bg-surface-2" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.15em] text-brand-ink">오늘의 내 기록</p>
              <h2 className="truncate text-lg font-black text-fg">{data.member.memberName}</h2>
              <p className="text-xs text-subtle">{formatSyncedAt(data.member.lastSyncedAt)}</p>
            </div>
          </div>
          <button type="button" onClick={openDetail} aria-haspopup="dialog" className="min-h-[44px] shrink-0 rounded-xl border border-line px-3 text-xs font-bold text-fg transition-colors hover:border-line-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60">
            상세 기록 보기
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Record label="롤체 전체 순위" value={data.tft.position ? `${data.tft.position}위` : '언랭'} detail={data.tft.label} />
          <Record label="직전 동기화 대비" value={data.tft.delta === null ? '비교 기록 없음' : data.tft.delta === 0 ? '변동 없음' : `${data.tft.delta > 0 ? '+' : ''}${data.tft.delta}점`} />
          <Record label="최근 7일 수집 최고" value={data.tft.weeklyBest ?? '아직 기록 없음'} />
          {data.lol ? <Record label="롤 전체 순위" value={data.lol.position ? `${data.lol.position}위` : '언랭'} detail={data.lol.label} /> : <RecentMatches matches={data.recentMatches} />}
        </div>

        {data.lol && <RecentMatches matches={data.recentMatches} wide />}
      </div>
      {panelMounted && <DashboardMemberPanel member={selected} onClose={() => setSelected(null)} />}
    </section>
  )
}

function Record({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <p className="text-xs font-bold text-subtle">{label}</p>
      <p className="mt-1 text-sm font-black text-fg">{value}</p>
      {detail && <p className="mt-0.5 truncate text-xs text-muted">{detail}</p>}
    </div>
  )
}

function RecentMatches({ matches, wide = false }: { matches: ReadyDashboard['recentMatches']; wide?: boolean }) {
  return (
    <div className={`rounded-xl border border-line bg-surface-2 p-3 ${wide ? 'lg:col-span-4' : ''}`}>
      <p className="text-xs font-bold text-subtle">최근 솔로 경기</p>
      {matches.length === 0 ? <p className="mt-1 text-sm font-black text-fg">아직 기록 없음</p> : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {matches.map((match) => <span key={match.id} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs font-bold text-fg">{match.placement ?? '-'}위</span>)}
        </div>
      )}
    </div>
  )
}
