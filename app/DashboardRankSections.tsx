'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { CARD } from '@/lib/ui/styles'
import { rankEffectClass } from '@/lib/cosmetics/rankEffects'
import RankCardBackground from '@/app/components/ranking/RankCardBackground'

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
  ranking_card_effect_key?: string | null
  ranking_card_bg_image?: string | null
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
      {/* 리더보드와 변동을 한 외부 카드 안에서 구분한다. */}
      <section className={`${CARD} p-5 sm:p-6 lg:col-span-2`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-warn-ink">Leaderboard</p>
            <h2 className="mt-1 text-lg font-black tracking-tight text-fg">롤체 랭킹</h2>
          </div>
          <Link href="/tft" className="text-xs font-bold text-brand-ink hover:text-brand-ink">
            전체 보기 →
          </Link>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-[minmax(0,1.5fr)_minmax(14rem,1fr)]">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-fg">TOP 5</h3>
            {leaderboard.length === 0 ? (
              <p className="mt-4 text-sm text-subtle">아직 랭크 기록이 없어요.</p>
            ) : (
              <ol className="mt-2 divide-y divide-line">
            {leaderboard.map((m, i) => (
              <li key={m.id}>
                {/* /tft 의 <article onClick> 과 달리 button 을 쓴다 — Tab·Enter 접근 가능 */}
                <button
                  type="button"
                  onClick={() => open(m)}
                  aria-haspopup="dialog"
                  aria-label={`${m.member_name} 상세 전적 보기`}
                  className={`relative isolate overflow-hidden flex w-full items-center gap-3 rounded-xl px-2 py-3 min-h-[48px] text-left transition-colors hover:bg-surface-2 ${rankEffectClass(m.ranking_card_effect_key)} ${TRIGGER_FOCUS}`}
                >
                  <RankCardBackground imagePath={m.ranking_card_bg_image} />
                  <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${i < 3 ? 'bg-warn/10 text-warn-ink' : 'bg-surface-2 text-subtle'}`}>{i + 1}</span>
                  {m.avatarUrl ? (
                    <Image
                      src={m.avatarUrl}
                      alt=""
                      width={32}
                      height={32}
                      className="h-9 w-9 shrink-0 rounded-xl border border-line object-cover"
                    />
                  ) : (
                    <span className="h-8 w-8 shrink-0 rounded-full bg-surface-2" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{m.member_name}</span>
                  <span className="shrink-0 text-xs font-bold text-muted">{m.rankLabel}</span>
                </button>
              </li>
            ))}
              </ol>
            )}
          </div>

          <div className="min-w-0 border-t border-line pt-5 md:border-l md:border-t-0 md:pl-5 md:pt-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-ink">Momentum</p>
            <h3 className="mt-1 text-sm font-black text-fg">최근 랭크 변동</h3>
            {movers.length === 0 ? (
              <p className="mt-4 text-sm text-subtle">직전 동기화 대비 변동이 없어요.</p>
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
                    className={`relative isolate overflow-hidden w-full min-h-[44px] text-left rounded-xl border border-line bg-surface-2 px-3 py-2.5 transition-colors hover:border-line-strong ${rankEffectClass(member.ranking_card_effect_key)} ${TRIGGER_FOCUS}`}
                  >
                    <RankCardBackground imagePath={member.ranking_card_bg_image} />
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-bold text-fg">{member.member_name}</span>
                      <span className={`shrink-0 text-xs font-black ${up ? 'text-ok-ink' : 'text-danger-ink'}`}>
                        {up ? '▲' : '▼'} {Math.abs(delta)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-subtle truncate">
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
          </div>
        </div>
      </section>

      {/* 상세 패널 — 홈은 솔로 기준이므로 queue 고정 */}
      {panelMounted && (
        <DashboardMemberPanel member={selected} onClose={() => setSelected(null)} />
      )}
    </>
  )
}
