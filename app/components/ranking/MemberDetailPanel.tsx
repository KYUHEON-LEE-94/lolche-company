'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { type HistoryPoint } from './LpSparkline'
import RankLineChart from '../charts/RankLineChart'
import PlacementHistogram from '../charts/PlacementHistogram'
import type { Json } from '@/types/supabase'
import { rarityBorderClass } from '@/lib/tft/tftLocale'

type TopUnit = {
  character_id: string
  name: string
  imageUrl: string
  count: number
  avgPlacement: number
}

type MemberStats = {
  total: number
  avgPlacement: number | null
  top4Rate: number
  winRate: number
  distribution: number[]
  recentForm: number[]
  topUnits: TopUnit[]
}

type TabKey = 'overview' | 'matches'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '개요' },
  { key: 'matches', label: '전적' },
]

function StatBox({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone?: 'ok' | 'warn'
}) {
  const color = tone === 'ok' ? 'text-emerald-400' : tone === 'warn' ? 'text-amber-400' : 'text-white'
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.07] px-3 py-2">
      <p className="text-[10px] text-slate-500 leading-none mb-1">{label}</p>
      <p className={`text-sm font-black leading-none ${color}`}>{value}</p>
    </div>
  )
}

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
  const queueLabel = queue === 'solo' ? '솔로' : '더블업'
  const [tab, setTab] = useState<TabKey>('overview')
  const [history, setHistory] = useState<HistoryPoint[] | null>(null)
  const [stats, setStats] = useState<MemberStats | null>(null)
  const [matches, setMatches] = useState<MatchRow[] | null>(null)

  // 이미 요청한 리소스를 다시 부르지 않기 위한 키 집합.
  const dataKey = `${member.id}|${queue}`
  const requestedRef = useRef<{ key: string; set: Set<string> }>({ key: dataKey, set: new Set() })

  // member/queue 가 바뀌면 렌더 중에 초기화한다(effect 내 setState 로 인한 캐스케이드 렌더 회피).
  const [loadedKey, setLoadedKey] = useState(dataKey)
  if (loadedKey !== dataKey) {
    setLoadedKey(dataKey)
    setHistory(null)
    setStats(null)
    setMatches(null)
  }

  const load = useCallback(
    (key: string, resource: string, url: string, apply: (d: unknown) => void) => {
      const store = requestedRef.current
      if (store.key !== key) requestedRef.current = { key, set: new Set() }
      const set = requestedRef.current.set
      if (set.has(resource)) return
      set.add(resource)
      fetch(url)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(apply)
        .catch((e) => {
          set.delete(resource)
          console.error(`${resource} fetch 실패:`, e instanceof Error ? e.message : '오류 발생')
        })
    },
    [],
  )

  // 탭별 lazy fetch — 마운트 시 필요한 것만 부른다.
  useEffect(() => {
    if (tab === 'overview') {
      load(dataKey, 'history', `/api/members/${member.id}/history`, (d) =>
        setHistory((d as { history?: HistoryPoint[] }).history ?? []),
      )
    }
    load(dataKey, 'stats', `/api/members/${member.id}/stats?queue=${queue}`, (d) =>
      setStats(d as MemberStats),
    )
    if (tab === 'matches') {
      load(dataKey, 'matches', `/api/members/${member.id}/matches?queue=${queue}&limit=10`, (d) =>
        setMatches((d as { matches?: MatchRow[] }).matches ?? []),
      )
    }
  }, [tab, member.id, queue, dataKey, load])

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
          className="fixed right-0 top-0 bottom-0 w-full max-w-sm sm:max-w-lg bg-[#0d1117] border-l border-white/[0.08] z-50 flex flex-col overflow-hidden"
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

          {/* 탭 */}
          <div className="flex border-b border-white/[0.06] px-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-xs font-black tracking-wide transition-colors border-b-2 -mb-px ${
                  tab === t.key
                    ? 'text-white border-indigo-400'
                    : 'text-slate-500 border-transparent hover:text-slate-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 스크롤 영역 */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

            {tab === 'overview' && (
              <>
                <section>
                  <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                    랭크 그래프 ({queueLabel})
                  </h3>
                  {history === null ? (
                    <div className="h-40 flex items-center justify-center text-slate-600 text-xs">불러오는 중…</div>
                  ) : (
                    <RankLineChart history={history} queue={queue} />
                  )}
                </section>

                <div className="h-px bg-white/[0.05]" />

                <section>
                  <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                    전적 요약 ({queueLabel})
                  </h3>
                  {stats === null ? (
                    <div className="text-slate-600 text-xs text-center py-4">불러오는 중…</div>
                  ) : stats.total === 0 ? (
                    <div className="text-slate-600 text-xs text-center py-4">매치 데이터 없음</div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <StatBox label="표본" value={`${stats.total}판`} />
                        <StatBox label="평균 등수" value={stats.avgPlacement?.toFixed(2) ?? '-'} />
                        <StatBox label="TOP4" value={`${stats.top4Rate}%`} tone="ok" />
                        <StatBox label="1위" value={`${stats.winRate}%`} tone="warn" />
                      </div>
                      {stats.recentForm.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] text-slate-600 mb-1.5">최근 {stats.recentForm.length}판</p>
                          <div className="flex gap-1 flex-wrap">
                            {stats.recentForm.map((p, i) => (
                              <span
                                key={i}
                                className={`w-6 h-6 rounded-md text-[11px] font-black flex items-center justify-center bg-white/[0.04] ${placementColor(p)}`}
                              >
                                {p}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </>
            )}

            {tab === 'matches' && (
              <>
                <section>
                  <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                    등수 분포
                  </h3>
                  {stats === null ? (
                    <div className="h-28 flex items-center justify-center text-slate-600 text-xs">불러오는 중…</div>
                  ) : (
                    <PlacementHistogram distribution={stats.distribution} />
                  )}
                </section>

                {stats && stats.topUnits.length > 0 && (
                  <section>
                    <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                      자주 쓴 기물
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {stats.topUnits.map((u) => (
                        <div key={u.character_id} className="flex flex-col items-center gap-0.5 w-12" title={`${u.name} · ${u.count}회 · 평균 ${u.avgPlacement}위`}>
                          <div className="relative w-8 h-8 rounded overflow-hidden border border-white/10 bg-white/5">
                            <Image src={u.imageUrl} alt={u.name} fill sizes="32px" className="object-cover" unoptimized />
                          </div>
                          <span className="text-[9px] text-slate-500 leading-none">{u.count}회</span>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <div className="h-px bg-white/[0.05]" />

                <section>
                  <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                    최근 매치
                  </h3>
                  {matches === null ? (
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
              </>
            )}

          </div>
        </motion.aside>
      </>
    </AnimatePresence>
  )
}
