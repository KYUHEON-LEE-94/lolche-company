'use client'

import { useState } from 'react'
import { isApexTier, tierScore, TIER_BASE } from '@/lib/tft/tierScore'
import type { HistoryPoint } from '../ranking/LpSparkline'

// 아래에서 위 순서. 표시용 짧은 라벨.
const TIER_MARKS: { label: string; score: number }[] = [
  { label: 'I', score: TIER_BASE.IRON },
  { label: 'B', score: TIER_BASE.BRONZE },
  { label: 'S', score: TIER_BASE.SILVER },
  { label: 'G', score: TIER_BASE.GOLD },
  { label: 'P', score: TIER_BASE.PLATINUM },
  { label: 'E', score: TIER_BASE.EMERALD },
  { label: 'D', score: TIER_BASE.DIAMOND },
  { label: 'M', score: TIER_BASE.MASTER },
]

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function tierLabel(tier: string | null, rank: string | null, lp: number | null) {
  if (!tier) return '언랭'
  return isApexTier(tier) ? `${tier} ${lp ?? 0}LP` : `${tier} ${rank ?? ''} ${lp ?? 0}LP`
}

export default function RankLineChart({
  history,
  queue = 'solo',
  height = 160,
}: {
  history: HistoryPoint[]
  queue?: 'solo' | 'doubleup'
  height?: number
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  const isDoubleup = queue === 'doubleup'
  const valid = history.filter((h) =>
    isDoubleup ? h.tft_doubleup_lp !== null : h.tft_lp !== null,
  )

  if (valid.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-slate-600 text-xs"
        style={{ height }}
      >
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
  // 값이 전부 같으면 range 0 → 0-division. 최소 100 을 보장한다.
  const range = maxS - minS || 100

  const W = 320
  const H = height
  const PAD_X = 22
  const PAD_Y = 14

  const toX = (i: number) => PAD_X + (i / (scores.length - 1)) * (W - PAD_X - 10)
  const toY = (s: number) => H - PAD_Y - ((s - minS) / range) * (H - PAD_Y * 2)

  const points = scores.map((s, i) => `${toX(i)},${toY(s)}`).join(' ')

  const overallUp = scores[scores.length - 1] >= scores[0]
  const lineColor = overallUp ? '#34d399' : '#f87171'

  const marks = TIER_MARKS.filter((m) => m.score >= minS && m.score <= maxS)

  // x축은 처음/중간/끝 3개만. 라벨 밀집 방지.
  const xTickIdx = Array.from(new Set([0, Math.floor((valid.length - 1) / 2), valid.length - 1]))

  return (
    <div className="relative select-none">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="rankLineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>

        {marks.map((m) => (
          <g key={m.label}>
            <line
              x1={PAD_X}
              x2={W - 10}
              y1={toY(m.score)}
              y2={toY(m.score)}
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text
              x={4}
              y={toY(m.score) + 3}
              fill="rgba(148,163,184,0.7)"
              fontSize="9"
              fontWeight="700"
            >
              {m.label}
            </text>
          </g>
        ))}

        <polygon
          points={`${toX(0)},${H} ${points} ${toX(scores.length - 1)},${H}`}
          fill="url(#rankLineGrad)"
        />

        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

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
              r={hoverIdx === i ? 4 : i === scores.length - 1 ? 3.5 : 2}
              fill={hoverIdx === i ? '#fff' : lineColor}
              stroke={hoverIdx === i ? lineColor : 'none'}
              strokeWidth="1.5"
              className="transition-all duration-100"
            />
          </g>
        ))}
      </svg>

      {hoverIdx !== null && (
        <div
          className="absolute -top-2 text-[11px] font-bold bg-[#0d1117] border border-white/10 rounded-lg px-2 py-1 pointer-events-none whitespace-nowrap z-10"
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

      <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-1">
        {xTickIdx.map((i) => (
          <span key={i}>{formatDate(valid[i].recorded_at)}</span>
        ))}
      </div>
    </div>
  )
}
