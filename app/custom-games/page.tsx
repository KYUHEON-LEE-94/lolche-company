'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Spinner } from '@/app/components/Spinner'
import SteamGamePicker, { type SteamGameSelection } from '@/app/custom-games/_components/SteamGamePicker'
import { TFT_TEAM_CAPACITY, type GameKind } from '@/lib/customGames/constants'
import {
  GAME_KIND_OPTIONS,
  formatKstSchedule,
  gameKindBadgeClass,
  gameKindLabel,
  statusBadgeClass,
  statusLabel,
  steamCapsuleUrl,
  todayKstDate,
} from '@/lib/customGames/display'

// 마이그레이션 미적용 환경에서는 GET이 구 컬럼만 담아 degrade하므로 파생 필드를 optional로 둔다.
type GameRow = {
  id: string
  title: string
  status: string
  game_type: string
  max_rounds: number
  created_at: string
  ended_at: string | null
  game_kind?: string
  game_kind_label?: string | null
  steam_app_id?: number | null
  capacity?: number
  scheduled_at?: string | null
  host_member_id?: string | null
  host_member_name?: string | null
  guest_count?: number
  confirmed_count?: number
  waitlist_count?: number
  can_manage?: boolean
  my_participation?: { position: number; confirmed: boolean } | null
}

const DEFAULT_CAPACITY = 8

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${className}`}>
      {children}
    </span>
  )
}

export default function CustomGamesPage() {
  const router = useRouter()
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [migrationRequired, setMigrationRequired] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [dateInput, setDateInput] = useState('')
  const [timeInput, setTimeInput] = useState('21:00')
  const [capacityInput, setCapacityInput] = useState(8)
  const [gameKind, setGameKind] = useState<GameKind>('tft')
  const [kindLabel, setKindLabel] = useState('')
  const [steamGame, setSteamGame] = useState<SteamGameSelection>({ label: '', appId: null })
  const [gameType, setGameType] = useState<'solo' | 'team'>('solo')
  const [maxRounds, setMaxRounds] = useState(5)
  const [creating, setCreating] = useState(false)

  const [busyId, setBusyId] = useState<string | null>(null)

  const showMsg = useCallback((type: 'error' | 'success', msg: string) => {
    if (type === 'error') { setError(msg); setSuccessMsg(null) }
    else { setSuccessMsg(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccessMsg(null) }, 4000)
  }, [])

  const loadGames = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/custom-games')
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '목록 로드 실패'); return }
      setGames((body.games ?? []) as GameRow[])
      setMigrationRequired(Boolean(body.migration_required))
    } catch { showMsg('error', '알 수 없는 오류가 발생했습니다') }
    finally { setLoading(false) }
  }, [showMsg])

  useEffect(() => { loadGames() }, [loadGames])

  const isTftTeam = gameKind === 'tft' && gameType === 'team'
  const effectiveCapacity = isTftTeam ? TFT_TEAM_CAPACITY : capacityInput

  const handleOpenModal = () => {
    setTitleInput('')
    setDateInput(todayKstDate())
    setTimeInput('21:00')
    setCapacityInput(8)
    setGameKind('tft')
    setKindLabel('')
    setSteamGame({ label: '', appId: null })
    setGameType('solo')
    setMaxRounds(5)
    setShowModal(true)
  }

  const handleCreate = async () => {
    if (!titleInput.trim()) { showMsg('error', '제목을 입력하세요'); return }
    if (!dateInput || !timeInput) { showMsg('error', '일자와 시간을 모두 입력하세요'); return }
    if (gameKind === 'etc' && !kindLabel.trim()) { showMsg('error', '기타 게임은 종류 이름을 입력하세요'); return }

    setCreating(true)
    try {
      // ⚠ 일자·시간은 문자열 그대로 보낸다. 클라이언트에서 Date로 변환하면
      //   브라우저 로컬 타임존으로 해석되어 실제 일정과 어긋난다.
      const res = await fetch('/api/custom-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.trim(),
          scheduled_date: dateInput,
          scheduled_time: timeInput,
          capacity: effectiveCapacity,
          game_kind: gameKind,
          game_kind_label:
            gameKind === 'etc'
              ? kindLabel.trim()
              : gameKind === 'steam'
                ? steamGame.label.trim() || null
                : null,
          ...(gameKind === 'steam' ? { steam_app_id: steamGame.appId } : {}),
          ...(gameKind === 'tft' ? { game_type: gameType, max_rounds: maxRounds } : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '생성 실패'); return }
      setShowModal(false)
      router.push(`/custom-games/${body.id}`)
    } catch { showMsg('error', '생성 중 오류가 발생했습니다') }
    finally { setCreating(false) }
  }

  const handleJoin = async (game: GameRow) => {
    setBusyId(game.id)
    try {
      const res = await fetch(`/api/custom-games/${game.id}/join`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '신청 실패'); return }
      showMsg('success', body.confirmed ? '참가가 확정되었습니다' : `대기 ${body.position}번으로 신청되었습니다`)
      await loadGames()
    } catch { showMsg('error', '신청 중 오류가 발생했습니다') }
    finally { setBusyId(null) }
  }

  const handleLeave = async (game: GameRow) => {
    if (!confirm('참가를 취소하시겠습니까?')) return
    setBusyId(game.id)
    try {
      const res = await fetch(`/api/custom-games/${game.id}/join`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '취소 실패'); return }
      showMsg('success', '참가가 취소되었습니다')
      await loadGames()
    } catch { showMsg('error', '취소 중 오류가 발생했습니다') }
    finally { setBusyId(null) }
  }

  const handleDelete = async (game: GameRow) => {
    if (!confirm('이 내전을 삭제하시겠습니까? 모든 참가 신청과 라운드 기록이 함께 삭제됩니다.')) return
    setBusyId(game.id)
    try {
      const res = await fetch(`/api/custom-games/${game.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '삭제 실패'); return }
      showMsg('success', '삭제되었습니다')
      await loadGames()
    } catch { showMsg('error', '삭제 중 오류가 발생했습니다') }
    finally { setBusyId(null) }
  }

  const recruitingCount = games.filter((g) => g.status === 'recruiting').length

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#07090f' }}>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(99,102,241,0.12) 0%, transparent 70%)' }}
      />

      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: 'rgba(7,9,15,0.85)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/tft"
              className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                <path d="M15 19l-7-7 7-7" />
              </svg>
              롤체 랭킹
            </Link>
            <span className="text-slate-700">·</span>
            <span className="text-sm font-black text-white">내전</span>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
              text-sm font-bold transition-all duration-200
              bg-indigo-500/10 border border-indigo-500/30 text-indigo-400
              hover:bg-indigo-500/20 hover:text-indigo-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 4v16m8-8H4" />
            </svg>
            내전 모집
          </button>
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div
          className="rounded-2xl border p-8"
          style={{ background: 'rgba(13,17,23,0.9)', borderColor: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}
        >
          <div className="mb-8">
            <h1 className="text-2xl font-black text-white tracking-tight mb-1">내전</h1>
            <p className="text-sm text-slate-500">
              내전을 모집하고 참가 신청을 받습니다
              {!loading && recruitingCount > 0 && ` · 모집 중 ${recruitingCount}건`}
            </p>
          </div>

          {migrationRequired && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm font-medium">
              내전 모집 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요.
            </div>
          )}

          {error && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-6 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              {successMsg}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
              <Spinner size={6} />
              <p className="text-sm font-semibold">로딩 중...</p>
            </div>
          )}

          {!loading && games.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-20 border border-dashed rounded-2xl"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <p className="text-slate-400 font-bold mb-1">모집 중인 내전이 없습니다</p>
              <p className="text-slate-600 text-sm">오른쪽 위 [내전 모집] 버튼으로 시작하세요</p>
            </div>
          )}

          {!loading && games.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {games.map((g) => {
                const capacity = g.capacity ?? DEFAULT_CAPACITY
                const taken = (g.confirmed_count ?? 0) + (g.guest_count ?? 0)
                const waitlistCount = g.waitlist_count ?? 0
                const mine = g.my_participation ?? null
                const joinable = g.status === 'recruiting'
                const busy = busyId === g.id

                return (
                  <div
                    key={g.id}
                    className="rounded-2xl border p-5 flex flex-col gap-3"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.07)' }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-black text-white leading-snug break-all">{g.title}</h2>
                      <Badge className={statusBadgeClass(g.status)}>{statusLabel(g.status)}</Badge>
                    </div>

                    {g.game_kind === 'steam' && g.steam_app_id != null && (
                      <div className="relative h-[42px] w-[110px] overflow-hidden rounded-lg border border-white/10 bg-white/[0.06]">
                        <Image
                          src={steamCapsuleUrl(g.steam_app_id)}
                          alt=""
                          fill
                          sizes="110px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className={gameKindBadgeClass(g.game_kind)}>
                        {gameKindLabel(g.game_kind, g.game_kind_label)}
                      </Badge>
                      {g.game_kind === 'tft' && (
                        <Badge className={g.game_type === 'team'
                          ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                          : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}>
                          {g.game_type === 'team' ? '2인 팀전' : '개인전'}
                        </Badge>
                      )}
                      <Badge className="bg-white/[0.04] border-white/[0.08] text-slate-300">
                        {taken}/{capacity}
                      </Badge>
                      {waitlistCount > 0 && (
                        <Badge className="bg-orange-500/10 border-orange-500/20 text-orange-400">
                          대기 {waitlistCount}명
                        </Badge>
                      )}
                      {mine && (
                        <Badge className={mine.confirmed
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}>
                          {mine.confirmed ? '참가 확정' : `대기 ${mine.position}번`}
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 flex flex-col gap-0.5">
                      <span>{formatKstSchedule(g.scheduled_at)}</span>
                      <span>주최: {g.host_member_name ?? '알 수 없음'}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <Link
                        href={`/custom-games/${g.id}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg
                          text-xs font-bold transition-all duration-150
                          bg-indigo-500/10 border border-indigo-500/25 text-indigo-400
                          hover:bg-indigo-500/20 hover:text-indigo-300"
                      >
                        상세
                      </Link>

                      {joinable && !mine && (
                        <button
                          type="button"
                          onClick={() => handleJoin(g)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-emerald-500/10 border border-emerald-500/25 text-emerald-400
                            hover:bg-emerald-500/20 hover:text-emerald-300
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          {taken >= capacity ? '대기 신청' : '참가 신청'}
                        </button>
                      )}

                      {joinable && mine && (
                        <button
                          type="button"
                          onClick={() => handleLeave(g)}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-white/[0.04] border border-white/[0.08] text-slate-400
                            hover:text-slate-200 hover:bg-white/[0.07]
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          참가 취소
                        </button>
                      )}

                      {g.can_manage && (
                        <button
                          type="button"
                          onClick={() => handleDelete(g)}
                          disabled={busy}
                          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-red-500/10 border border-red-500/20 text-red-400
                            hover:bg-red-500/20 hover:text-red-300
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          삭제
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {!loading && games.length > 0 && (
            <p className="mt-4 text-xs text-slate-600 font-medium">총 {games.length}개</p>
          )}
        </div>
      </main>

      {/* 모집 폼 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => !creating && setShowModal(false)}
          />
          <div
            className="relative w-full max-w-lg rounded-2xl border p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
            style={{ background: 'rgb(13,17,23)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <div>
              <h2 className="text-lg font-black text-white mb-1">내전 모집</h2>
              <p className="text-sm text-slate-500">일정과 정원을 정하면 참가 신청을 받습니다</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">제목</label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="예) 금요일 저녁 내전"
                maxLength={60}
                disabled={creating}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-white
                  bg-white/[0.04] border border-white/[0.08]
                  placeholder:text-slate-600
                  focus:outline-none focus:border-indigo-500/50
                  transition-all duration-200 disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">일자</label>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  disabled={creating}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-white
                    bg-white/[0.04] border border-white/[0.08]
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">시간 (KST)</label>
                <input
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  disabled={creating}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-white
                    bg-white/[0.04] border border-white/[0.08]
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">게임 종류</label>
              <div className="grid grid-cols-4 gap-2">
                {GAME_KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGameKind(opt.value)}
                    disabled={creating}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                      gameKind === opt.value
                        ? 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300'
                        : 'bg-white/[0.03] border border-white/[0.07] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                    } disabled:opacity-50`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {gameKind === 'etc' && (
                <input
                  type="text"
                  value={kindLabel}
                  onChange={(e) => setKindLabel(e.target.value)}
                  placeholder="게임 이름 (예: 배틀그라운드)"
                  maxLength={30}
                  disabled={creating}
                  className="mt-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white
                    bg-white/[0.04] border border-white/[0.08]
                    placeholder:text-slate-600
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              )}
              {gameKind === 'steam' && !migrationRequired && (
                <SteamGamePicker value={steamGame} onChange={setSteamGame} disabled={creating} />
              )}
              {gameKind !== 'tft' && (
                <p className="mt-1.5 text-xs text-slate-600">
                  롤체 외 내전은 모집·참가 관리만 지원합니다 (라운드 결과 기록 없음)
                </p>
              )}
            </div>

            {gameKind === 'tft' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">게임 방식</label>
                  <div className="flex gap-2">
                    {([['solo', '개인전'], ['team', '팀전 (4팀 × 2인)']] as const).map(([type, label]) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setGameType(type)}
                        disabled={creating}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                          gameType === type
                            ? type === 'team'
                              ? 'bg-violet-500/25 border border-violet-500/50 text-violet-300'
                              : 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300'
                            : 'bg-white/[0.03] border border-white/[0.07] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                        } disabled:opacity-50`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {isTftTeam && (
                    <p className="mt-1.5 text-xs text-violet-400/70">팀전은 4팀 × 2인 구조라 정원이 8명으로 고정됩니다</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">최대 판수</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMaxRounds(n)}
                        disabled={creating}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                          maxRounds === n
                            ? 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300'
                            : 'bg-white/[0.03] border border-white/[0.07] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                        } disabled:opacity-50`}
                      >
                        {n}판
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">정원</label>
              <input
                type="number"
                min={2}
                max={100}
                value={effectiveCapacity}
                onChange={(e) => setCapacityInput(Number(e.target.value))}
                disabled={creating || isTftTeam}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-white
                  bg-white/[0.04] border border-white/[0.08]
                  focus:outline-none focus:border-indigo-500/50
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="mt-1.5 text-xs text-slate-600">
                {isTftTeam ? '팀전은 8명 고정입니다' : '2~100명. 정원을 넘는 신청은 자동으로 대기자가 됩니다'}
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={creating}
                className="flex-1 py-3 rounded-xl text-sm font-bold
                  bg-white/[0.04] border border-white/[0.07] text-slate-400
                  hover:text-slate-200 hover:bg-white/[0.07]
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || !titleInput.trim() || !dateInput || !timeInput}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl
                  text-sm font-bold transition-all duration-200
                  bg-indigo-500/20 border border-indigo-500/40 text-indigo-300
                  hover:bg-indigo-500/30 hover:text-indigo-200
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? <><Spinner size={4} /> 등록 중...</> : '모집 시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
