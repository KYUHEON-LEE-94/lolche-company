'use client'

import { useState } from 'react'

export type HistoryPoint = {
  tft_tier: string | null
  tft_rank: string | null
  tft_lp: number | null
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_lp: number | null
  recorded_at: string
}

const TIER_BASE: Record<string, number> = {
  IRON: 0, BRONZE: 400, SILVER: 800, GOLD: 1200,
  PLATINUM: 1600, EMERALD: 2000, DIAMOND: 2400,
  MASTER: 2800, GRANDMASTER: 2800, CHALLENGER: 2800,
}
const RANK_OFFSET: Record<string, number> = { IV: 0, III: 100, II: 200, I: 300 }

export function tierScore(tier: string | null, rank: string | null, lp: number | null): number {
  if (!tier || lp === null) return -1
  const t = tier.toUpperCase()
  const base = TIER_BASE[t] ?? 0
  const isMaster = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(t)
  const offset = isMaster ? 0 : (RANK_OFFSET[rank ?? 'IV'] ?? 0)
  return base + offset + lp
}

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function tierLabel(tier: string | null, rank: string | null, lp: number | null) {
  if (!tier) return '언랭'
  const isMaster = ['MASTER', 'GRANDMASTER', 'CHALLENGER'].includes(tier.toUpperCase())
  return isMaster ? `${tier} ${lp ?? 0}LP` : `${tier} ${rank ?? ''} ${lp ?? 0}LP`
}

export default function LpSparkline({
  history,
  queue = 'solo',
}: {
  history: HistoryPoint[]
  queue?: 'solo' | 'doubleup'
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const isDoubleup = queue === 'doubleup'
  const valid = history.filter((h) =>
    isDoubleup ? h.tft_doubleup_lp !== null : h.tft_lp !== null,
  )
  if (valid.length < 2) {
    return (
      <div className="flex items-center justify-center h-20 text-slate-600 text-xs">
        히스토리 데이터 없음 (동기화 후 누적)
      </div>
    )
  }

  const scores = valid.map((h) =>
    isDoubleup
      ? tierScore(h.tft_doubleup_tier, h.tft_doubleup_rank, h.tft_doubleup_lp)
      : tierScore(h.tft_tier, h.tft_rank, h.tft_lp),
  )
  const minS = Math.min(...scores)
  const maxS = Math.max(...scores)
  const range = maxS - minS || 100

  const W = 280, H = 72
  const PAD = 8

  const toX = (i: number) =>
    PAD + (i / (scores.length - 1)) * (W - PAD * 2)
  const toY = (s: number) =>
    H - PAD - ((s - minS) / range) * (H - PAD * 2)

  const points = scores.map((s, i) => `${toX(i)},${toY(s)}`).join(' ')

  const last = scores[scores.length - 1]
  const first = scores[0]
  const overallUp = last >= first
  const lineColor = overallUp ? '#34d399' : '#f87171'

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-20"
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* 그라데이션 */}
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 채움 영역 */}
        <polygon
          points={`${toX(0)},${H} ${points} ${toX(scores.length - 1)},${H}`}
          fill="url(#sparkGrad)"
        />

        {/* 선 */}
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* 인터랙티브 포인트 */}
        {scores.map((s, i) => (
          <g key={i}>
            <circle
              cx={toX(i)}
              cy={toY(s)}
              r="10"
              fill="transparent"
              onMouseEnter={() => setHoverIdx(i)}
            />
            <circle
              cx={toX(i)}
              cy={toY(s)}
              r={hoverIdx === i ? 4 : i === scores.length - 1 ? 3.5 : 2.5}
              fill={hoverIdx === i ? '#fff' : lineColor}
              stroke={hoverIdx === i ? lineColor : 'none'}
              strokeWidth="1.5"
              className="transition-all duration-100"
            />
          </g>
        ))}
      </svg>

      {/* 툴팁 */}
      {hoverIdx !== null && (
        <div
          className="absolute -top-9 text-[11px] font-bold bg-[#0d1117] border border-white/10 rounded-lg px-2 py-1 pointer-events-none whitespace-nowrap z-10"
          style={{
            left: `${(toX(hoverIdx) / W) * 100}%`,
            transform: hoverIdx > scores.length / 2 ? 'translateX(-100%)' : 'translateX(0)',
          }}
        >
          <span className="text-slate-400 mr-1">{formatDate(valid[hoverIdx].recorded_at)}</span>
          <span style={{ color: lineColor }}>
            {isDoubleup
              ? tierLabel(valid[hoverIdx].tft_doubleup_tier, valid[hoverIdx].tft_doubleup_rank, valid[hoverIdx].tft_doubleup_lp)
              : tierLabel(valid[hoverIdx].tft_tier, valid[hoverIdx].tft_rank, valid[hoverIdx].tft_lp)}
          </span>
        </div>
      )}

      {/* 첫/마지막 날짜 */}
      <div className="flex justify-between text-[10px] text-slate-600 mt-0.5 px-1">
        <span>{formatDate(valid[0].recorded_at)}</span>
        <span>{formatDate(valid[valid.length - 1].recorded_at)}</span>
      </div>
    </div>
  )
}
