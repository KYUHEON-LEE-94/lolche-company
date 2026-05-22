'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import LpSparkline, { type HistoryPoint } from './LpSparkline'
import type { Json } from '@/types/supabase'
import { rarityBorderClass } from '@/lib/tft/tftLocale'

type ProcessedUnit = {
  character_id: string
  name: string
  rarity: number
  tier: number
  imageUrl: string
}

type MatchRow = {
  match_id: string
  game_datetime: string | null
  game_length_seconds: number | null
  queue_id: number | null
  placement: number | null
  level: number | null
  augments: Json | null
  traits: Json | null
  units: ProcessedUnit[] | null
}

type MemberInfo = {
  id: string
  member_name: string
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
}

function placementColor(p: number) {
  if (p === 1) return 'text-yellow-400'
  if (p <= 4) return 'text-emerald-400'
  return 'text-slate-500'
}

function placementLabel(p: number) {
  return `${p}위`
}

function formatGameLength(sec: number | null) {
  if (!sec) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function cleanName(raw: string) {
  return raw
    .replace(/^TFT\d+_Augment_/, '')
    .replace(/^TFT\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

function getAugments(augments: Json | null): string[] {
  if (!Array.isArray(augments)) return []
  return (augments as string[]).map(cleanName).slice(0, 3)
}

function getActiveTraits(traits: Json | null) {
  if (!Array.isArray(traits)) return []
  return (traits as { name: string; num_units: number; style: number }[])
    .filter((t) => t.style > 0)
    .sort((a, b) => b.style - a.style)
    .slice(0, 3)
    .map((t) => ({ name: cleanName(t.name), units: t.num_units, style: t.style }))
}

function UnitIcon({ unit }: { unit: ProcessedUnit }) {
  const [imgError, setImgError] = useState(false)
  const border = rarityBorderClass(unit.rarity)

  return (
    <div className="flex flex-col items-center gap-0.5" title={unit.name}>
      <div className={`relative w-8 h-8 rounded overflow-hidden border-2 ${border} bg-white/5`}>
        {!imgError ? (
          <Image
            src={unit.imageUrl}
            alt={unit.name}
            fill
            sizes="32px"
            className="object-cover"
            onError={() => setImgError(true)}
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[8px] text-slate-500 leading-none text-center px-0.5">
            {unit.name}
          </div>
        )}
      </div>
      {unit.tier >= 2 && (
        <div className="text-[7px] text-yellow-300 leading-none tracking-[-1px]">
          {'★'.repeat(unit.tier)}
        </div>
      )}
    </div>
  )
}

function MatchCard({ match }: { match: MatchRow }) {
  const placement = match.placement ?? 0
  const augments = getAugments(match.augments)
  const traits = getActiveTraits(match.traits)
  const units = match.units ?? []

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] p-3 flex gap-3">
      {/* 순위 */}
      <div className={`flex-shrink-0 w-12 text-center font-black text-2xl leading-none pt-1 ${placementColor(placement)}`}>
        {placementLabel(placement)}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        {/* 날짜 + 게임 길이 */}
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          <span>{formatDate(match.game_datetime)}</span>
          {match.game_length_seconds && (
            <span className="text-slate-600">{formatGameLength(match.game_length_seconds)}</span>
          )}
        </div>

        {/* 기물 아이콘 */}
        {units.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {units.map((u, i) => (
              <UnitIcon key={i} unit={u} />
            ))}
          </div>
        )}

        {/* 증강 */}
        {augments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {augments.map((a, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 leading-tight">
                {a}
              </span>
            ))}
          </div>
        )}

        {/* 특성 */}
        {traits.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {traits.map((t, i) => (
              <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 leading-tight">
                {t.name} ×{t.units}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MemberDetailPanel({
  member,
  queue = 'solo',
  onClose,
}: {
  member: MemberInfo
  queue?: 'solo' | 'doubleup'
  onClose: () => void
}) {
  const [history, setHistory] = useState<HistoryPoint[]>([])
  const [matches, setMatches] = useState<MatchRow[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(true)

  useEffect(() => {
    fetch(`/api/members/${member.id}/history`)
      .then((r) => r.json())
      .then((d) => setHistory(d.history ?? []))
      .catch(() => {})
      .finally(() => setLoadingHistory(false))

    fetch(`/api/members/${member.id}/matches?queue=${queue}`)
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []))
      .catch(() => {})
      .finally(() => setLoadingMatches(false))
  }, [member.id])

  // ESC 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <AnimatePresence>
      <>
        {/* 배경 오버레이 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* 패널 */}
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-0 w-full max-w-sm bg-[#0d1117] border-l border-white/[0.08] z-50 flex flex-col overflow-hidden"
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
            <div>
              <p className="font-black text-white text-base leading-tight">{member.member_name}</p>
              {member.tft_tier && (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {member.tft_tier} {member.tft_rank} · {member.tft_league_points ?? 0} LP
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 스크롤 영역 */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

            {/* LP 히스토리 차트 */}
            <section>
              <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                LP 히스토리 ({queue === 'solo' ? '솔로' : '더블업'})
              </h3>
              {loadingHistory ? (
                <div className="h-20 flex items-center justify-center text-slate-600 text-xs">불러오는 중…</div>
              ) : (
                <LpSparkline history={history} queue={queue} />
              )}
            </section>

            <div className="h-px bg-white/[0.05]" />

            {/* 최근 5경기 */}
            <section>
              <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                최근 매치
              </h3>
              {loadingMatches ? (
                <div className="text-slate-600 text-xs text-center py-4">불러오는 중…</div>
              ) : matches.length === 0 ? (
                <div className="text-slate-600 text-xs text-center py-4">매치 데이터 없음</div>
              ) : (
                <div className="space-y-2">
                  {matches.map((m) => (
                    <MatchCard key={m.match_id} match={m} />
                  ))}
                </div>
              )}
            </section>

          </div>
        </motion.aside>
      </>
    </AnimatePresence>
  )
}
