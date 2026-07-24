'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { CARD } from '@/lib/ui/styles'

// 차트·framer-motion 이 홈 초기 번들에 들어가지 않도록 지연 로드한다.
const DashboardMemberPanel = dynamic(
  () => import('@/app/components/ranking/DashboardMemberPanel'),
  { ssr: false },
)

/** 패널이 요구하는 최소 5필드 + 홈 표시용 파생값. 서버에서 조립해 넘긴다. */
export type DashRankMember = {
  id: string
  member_name: string
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  avatarUrl: string | null
  rankLabel: string
}

export type DashMover = {
  member: DashRankMember
  delta: number
  prevLabel: string
}

const TRIGGER_FOCUS =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60'

export default function DashboardRankSections({
  leaderboard,
  movers,
}: {
  leaderboard: DashRankMember[]
  movers: DashMover[]
}) {
  const [selected, setSelected] = useState<DashRankMember | null>(null)
  // 닫기 애니메이션을 위해 한 번 열린 뒤에는 패널 래퍼를 계속 마운트해 둔다.
  const [panelMounted, setPanelMounted] = useState(false)

  const open = (member: DashRankMember) => {
    setPanelMounted(true)
    setSelected(member)
  }

  return (
    <>
      {/* ① 리더보드 TOP5 */}
      <section className={`${CARD} p-5 lg:col-span-2`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-black text-white">롤체 TOP 5</h2>
          <Link href="/tft" className="text-xs font-bold text-indigo-300 hover:text-indigo-200">
            전체 보기 →
          </Link>
        </div>

        {leaderboard.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">아직 랭크 기록이 없어요.</p>
        ) : (
          <ol className="mt-3 divide-y divide-line">
            {leaderboard.map((m, i) => (
              <li key={m.id}>
                {/* /tft 의 <article onClick> 과 달리 button 을 쓴다 — Tab·Enter 접근 가능 */}
                <button
                  type="button"
                  onClick={() => open(m)}
                  aria-haspopup="dialog"
                  aria-label={`${m.member_name} 상세 전적 보기`}
                  className={`flex w-full items-center gap-3 py-2.5 min-h-[44px] text-left rounded-lg transition-colors hover:bg-surface-2 ${TRIGGER_FOCUS}`}
                >
                  <span className="w-5 shrink-0 text-center text-sm font-black text-slate-500">{i + 1}</span>
                  {m.avatarUrl ? (
                    <Image
                      src={m.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="h-8 w-8 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="h-8 w-8 shrink-0 rounded-full bg-surface-2" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{m.member_name}</span>
                  <span className="shrink-0 text-xs font-bold text-slate-400">{m.rankLabel}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* ② 최근 랭크 변동 */}
      <section className={`${CARD} p-5`}>
        <h2 className="text-sm font-black text-white">최근 랭크 변동</h2>

        {movers.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">직전 동기화 대비 변동이 없어요.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {movers.map(({ member, delta, prevLabel }) => {
              const up = delta > 0
              return (
                <li key={member.id}>
                  <button
                    type="button"
                    onClick={() => open(member)}
                    aria-haspopup="dialog"
                    aria-label={`${member.member_name} 상세 전적 보기`}
                    className={`w-full min-h-[44px] text-left rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong ${TRIGGER_FOCUS}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-bold text-white">{member.member_name}</span>
                      <span className={`shrink-0 text-xs font-black ${up ? 'text-emerald-400' : 'text-red-400'}`}>
                        {up ? '▲' : '▼'} {Math.abs(delta)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 truncate">
                      {prevLabel}
                      {' → '}
                      {member.rankLabel}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* 상세 패널 — 홈은 솔로 기준이므로 queue 고정 */}
      {panelMounted && (
        <DashboardMemberPanel member={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
