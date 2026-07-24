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

type MemberAccount = {
  id: string
  account_no: number
  is_primary: boolean
  riot_game_name: string
  riot_tagline: string
  synced: boolean
  tft_tier: string | null
  tft_rank: string | null
  tft_league_points: number | null
  tft_wins: number | null
  tft_losses: number | null
  tft_doubleup_tier: string | null
  tft_doubleup_rank: string | null
  tft_doubleup_league_points: number | null
  tft_doubleup_wins: number | null
  tft_doubleup_losses: number | null
  last_synced_at: string | null
}

/** fetch 실패 시 "불러오는 중…" 고착을 막기 위한 확정값(= 표본 0판). */
const EMPTY_STATS: MemberStats = {
  total: 0,
  avgPlacement: null,
  top4Rate: 0,
  winRate: 0,
  distribution: [],
  recentForm: [],
  topUnits: [],
}

type TabKey = 'overview' | 'matches' | 'accounts'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '개요' },
  { key: 'matches', label: '전적' },
  { key: 'accounts', label: '계정' },
]

/**
 * 매치·랭크 히스토리는 대표 계정 puuid 로만 수집된다
 * (`tft_match_participants` 는 대표 puuid, `member_rank_history` 에는 계정 축이 없다).
 * 부계정으로 필터하면 항상 0건이라 빈 차트가 버그로 오인되므로 문구로 대신한다.
 */
const ACCOUNT_SCOPE_NOTICE = '매치와 그래프는 대표 계정 기준입니다.'

function accountRank(a: MemberAccount, queue: 'solo' | 'doubleup') {
  return queue === 'solo'
    ? { tier: a.tft_tier, rank: a.tft_rank, lp: a.tft_league_points, wins: a.tft_wins, losses: a.tft_losses }
    : {
        tier: a.tft_doubleup_tier,
        rank: a.tft_doubleup_rank,
        lp: a.tft_doubleup_league_points,
        wins: a.tft_doubleup_wins,
        losses: a.tft_doubleup_losses,
      }
}

function formatSyncedAt(iso: string | null) {
  if (!iso) return '동기화 기록 없음'
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function AccountCard({
  account,
  queue,
  selected,
  onSelect,
}: {
  account: MemberAccount
  queue: 'solo' | 'doubleup'
  selected: boolean
  onSelect: () => void
}) {
  const r = accountRank(account, queue)
  const total = (r.wins ?? 0) + (r.losses ?? 0)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left rounded-xl border px-3 py-3 transition-colors ${
        selected
          ? 'border-indigo-400/60 bg-indigo-500/10'
          : 'border-white/[0.07] bg-white/[0.03] hover:border-white/20'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-black text-white truncate">
          {account.riot_game_name}
          <span className="text-slate-500 font-bold">#{account.riot_tagline}</span>
        </span>
        {account.is_primary && (
          <span className="shrink-0 text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/30 text-indigo-300">
            대표
          </span>
        )}
      </div>

      <div className="mt-1.5 text-xs text-slate-300">
        {r.tier ? (
          <>
            {r.tier} {r.rank} · {r.lp ?? 0} LP
            {total > 0 && (
              <span className="text-slate-500">
                {' '}
                · {r.wins ?? 0}승 {r.losses ?? 0}패
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-600">{account.synced ? '언랭크' : '동기화 대기'}</span>
        )}
      </div>

      <p className="mt-1 text-[10px] text-slate-600">
        마지막 동기화 {formatSyncedAt(account.last_synced_at)}
      </p>
    </button>
  )
}

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
  const [accounts, setAccounts] = useState<MemberAccount[] | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

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
    setAccounts(null)
    setSelectedAccountId(null)
  }

  // onFail 은 필수 인자다 — 빠뜨리면 실패 시 "불러오는 중…" 에 영구 고착된다.
  const load = useCallback(
    (
      key: string,
      resource: string,
      url: string,
      apply: (d: unknown) => void,
      onFail: () => void,
    ) => {
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
          onFail()
        })
    },
    [],
  )

  // 탭별 lazy fetch — 마운트 시 필요한 것만 부른다.
  useEffect(() => {
    if (tab === 'overview') {
      load(
        dataKey,
        'history',
        `/api/members/${member.id}/history`,
        (d) => setHistory((d as { history?: HistoryPoint[] }).history ?? []),
        () => setHistory([]),
      )
    }
    load(
      dataKey,
      'stats',
      `/api/members/${member.id}/stats?queue=${queue}`,
      (d) => setStats(d as MemberStats),
      () => setStats(EMPTY_STATS),
    )
    if (tab === 'matches') {
      load(
        dataKey,
        'matches',
        `/api/members/${member.id}/matches?queue=${queue}&limit=10`,
        (d) => setMatches((d as { matches?: MatchRow[] }).matches ?? []),
        () => setMatches([]),
      )
    }
    // 계정 탭은 "2개 이상일 때만" 노출하므로 개수를 알기 위해 탭과 무관하게 부른다.
    // 페이로드가 최대 3행이라 지연 로드보다 즉시 로드가 낫다.
    load(
      dataKey,
      'accounts',
      `/api/members/${member.id}/accounts`,
      (d) => {
        const list = (d as { accounts?: MemberAccount[] }).accounts ?? []
        setAccounts(list)
        setSelectedAccountId(list.find((a) => a.is_primary)?.id ?? list[0]?.id ?? null)
      },
      () => {
        setAccounts([])
        setSelectedAccountId(null)
      },
    )
  }, [tab, member.id, queue, dataKey, load])

  const multiAccount = (accounts?.length ?? 0) > 1
  const visibleTabs = TABS.filter((t) => t.key !== 'accounts' || multiAccount)
  const selectedAccount = accounts?.find((a) => a.id === selectedAccountId) ?? null
  const subAccountSelected = !!selectedAccount && !selectedAccount.is_primary

  // 계정이 1개로 줄어드는 경로(다른 멤버 전환)에서 사라진 탭에 머무르지 않도록 되돌린다.
  if (tab === 'accounts' && accounts !== null && !multiAccount) {
    setTab('overview')
  }

  // 부계정을 고르면 헤더의 랭크 표시만 바뀐다(그래프·매치는 대표 계정 데이터 그대로).
  const headerRank = subAccountSelected && selectedAccount
    ? accountRank(selectedAccount, queue)
    : { tier: member.tft_tier, rank: member.tft_rank, lp: member.tft_league_points }

  // ESC 닫기 + 배경 스크롤 잠금 + 닫은 뒤 트리거로 포커스 복귀
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)

    return () => {
      window.removeEventListener('keydown', handler)
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
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
          aria-hidden
        />

        {/* 패널 */}
        <motion.aside
          role="dialog"
          aria-modal="true"
          aria-label={`${member.member_name} 상세 전적`}
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
              {headerRank.tier ? (
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {headerRank.tier} {headerRank.rank} · {headerRank.lp ?? 0} LP
                  {subAccountSelected && selectedAccount && (
                    <span className="text-slate-600">
                      {' '}
                      · {selectedAccount.riot_game_name}#{selectedAccount.riot_tagline}
                    </span>
                  )}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              ✕
            </button>
          </div>

          {/* 탭 */}
          <div className="flex border-b border-white/[0.06] px-3">
            {visibleTabs.map((t) => (
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

            {tab !== 'accounts' && subAccountSelected && (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-300">
                {ACCOUNT_SCOPE_NOTICE}
              </p>
            )}

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

            {tab === 'accounts' && accounts && (
              <section>
                <h3 className="text-[11px] font-black tracking-widest text-slate-500 uppercase mb-3">
                  라이엇 계정 ({queueLabel})
                </h3>
                <div className="space-y-2">
                  {accounts.map((a) => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      queue={queue}
                      selected={a.id === selectedAccountId}
                      onSelect={() => setSelectedAccountId(a.id)}
                    />
                  ))}
                </div>
                <p className="mt-3 text-[11px] text-slate-500">{ACCOUNT_SCOPE_NOTICE}</p>
              </section>
            )}

          </div>
        </motion.aside>
      </>
    </AnimatePresence>
  )
}
