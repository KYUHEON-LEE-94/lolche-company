'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Spinner } from '@/app/components/Spinner'
import SteamGamePicker, { type SteamGameSelection } from '@/app/custom-games/_components/SteamGamePicker'
import { LOL_CAPACITY, LOL_MODES, TFT_TEAM_CAPACITY, type GameKind, type LolMode } from '@/lib/customGames/constants'
import {
  GAME_KIND_OPTIONS,
  LOL_MODE_LABELS,
  formatKstSchedule,
  gameKindBadgeClass,
  gameKindLabel,
  lolModeLabel,
  openNativePicker,
  effectiveStatusBadgeClass,
  effectiveStatusLabel,
  isRecruitClosed,
  steamCapsuleUrl,
  todayKstDate,
} from '@/lib/customGames/display'
import { ALERT, BTN_GHOST, CARD_HOVER, CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import EmptyState from '@/app/components/ui/EmptyState'

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
  lol_mode?: string | null
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
  const [lolMode, setLolMode] = useState<LolMode>('rift')
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

  const isLol = gameKind === 'lol'
  const isTftTeam = gameKind === 'tft' && gameType === 'team'
  const effectiveCapacity = isLol ? LOL_CAPACITY : isTftTeam ? TFT_TEAM_CAPACITY : capacityInput

  const handleOpenModal = () => {
    setTitleInput('')
    setDateInput(todayKstDate())
    setTimeInput('21:00')
    setCapacityInput(8)
    setGameKind('tft')
    setKindLabel('')
    setSteamGame({ label: '', appId: null })
    setLolMode('rift')
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
          ...(gameKind === 'lol' ? { lol_mode: lolMode } : {}),
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
      const body = await res.json().catch(() => ({}))
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
      const body = await res.json().catch(() => ({}))
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
    <>
      <main className={SHELL}>
      <div className={CONTAINER}>
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <PageHeader
            kicker="Custom Games"
            accent="indigo"
            title="내전"
            description={`내전을 모집하고 참가 신청을 받습니다${
              !loading && recruitingCount > 0 ? ` · 모집 중 ${recruitingCount}건` : ''
            }`}
            className=""
          />
          <button type="button" onClick={handleOpenModal} className={BTN_GHOST}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 4v16m8-8H4" />
            </svg>
            내전 모집
          </button>
        </div>

          {migrationRequired && (
            <div className={`mb-6 ${ALERT.warn}`}>
              내전 모집 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요.
            </div>
          )}

          {error && (
            <div className={`mb-6 ${ALERT.error}`}>
              {error}
            </div>
          )}
          {successMsg && (
            <div className={`mb-6 ${ALERT.ok}`}>
              {successMsg}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-subtle">
              <Spinner size={6} />
              <p className="text-sm font-semibold">로딩 중...</p>
            </div>
          )}

          {!loading && games.length === 0 && (
            <EmptyState hint="위쪽 [내전 모집] 버튼으로 시작하세요">모집 중인 내전이 없습니다</EmptyState>
          )}

          {!loading && games.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {games.map((g) => {
                const capacity = g.capacity ?? DEFAULT_CAPACITY
                const taken = (g.confirmed_count ?? 0) + (g.guest_count ?? 0)
                const waitlistCount = g.waitlist_count ?? 0
                const mine = g.my_participation ?? null
                // 예정 시각이 지난 recruiting 은 "마감"으로 보고 참가를 막는다.
                const joinable = g.status === 'recruiting' && !isRecruitClosed(g.status, g.scheduled_at)
                const busy = busyId === g.id

                return (
                  <div
                    key={g.id}
                    onClick={() => router.push(`/custom-games/${g.id}`)}
                    className={`${CARD_HOVER} p-5 flex flex-col gap-3 cursor-pointer`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-black text-fg leading-snug break-all">{g.title}</h2>
                      <Badge className={effectiveStatusBadgeClass(g.status, g.scheduled_at)}>{effectiveStatusLabel(g.status, g.scheduled_at)}</Badge>
                    </div>

                    {g.game_kind === 'steam' && g.steam_app_id != null && (
                      <div className="relative h-[42px] w-[110px] overflow-hidden rounded-lg border border-line bg-surface-2">
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
                    {(g.game_kind === 'tft' || g.game_kind === 'lol') && (
                      <div className="relative h-[42px] w-[42px] shrink-0 overflow-hidden rounded-lg border border-line bg-surface-2">
                        <Image src={`/custom-games/${g.game_kind}.png`} alt="" fill sizes="42px" className="object-cover" />
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
                      {g.game_kind === 'lol' && g.lol_mode && (
                        <Badge className="bg-sky-500/10 border-sky-500/20 text-sky-400">
                          {lolModeLabel(g.lol_mode)}
                        </Badge>
                      )}
                      <Badge className="bg-surface-2 border-line text-muted">
                        {taken}/{capacity}
                      </Badge>
                      {waitlistCount > 0 && (
                        <Badge className="bg-orange-500/10 border-orange-500/20 text-orange-400">
                          대기 {waitlistCount}명
                        </Badge>
                      )}
                      {mine && (
                        <Badge className={mine.confirmed
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-ok-ink'
                          : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}>
                          {mine.confirmed ? '참가 확정' : `대기 ${mine.position}번`}
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-subtle flex flex-col gap-0.5">
                      <span>{formatKstSchedule(g.scheduled_at)}</span>
                      <span>주최: {g.host_member_name ?? '알 수 없음'}</span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      {joinable && !mine && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleJoin(g) }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-emerald-500/10 border border-emerald-500/25 text-ok-ink
                            hover:bg-emerald-500/20 hover:text-ok-ink
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          {taken >= capacity ? '대기 신청' : '참가 신청'}
                        </button>
                      )}

                      {joinable && mine && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleLeave(g) }}
                          disabled={busy}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-surface-2 border border-line text-muted
                            hover:text-fg hover:bg-surface-2
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {busy ? <Spinner size={3} /> : null}
                          참가 취소
                        </button>
                      )}

                      {g.can_manage && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleDelete(g) }}
                          disabled={busy}
                          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                            text-xs font-bold transition-all duration-150
                            bg-red-500/10 border border-red-500/20 text-danger-ink
                            hover:bg-red-500/20 hover:text-danger-ink
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
            <p className="mt-4 text-xs text-faint font-medium">총 {games.length}개</p>
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
            className="relative w-full max-w-lg rounded-2xl border border-line bg-panel p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
          >
            <div>
              <h2 className="text-lg font-black text-fg mb-1">내전 모집</h2>
              <p className="text-sm text-subtle">일정과 정원을 정하면 참가 신청을 받습니다</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">제목</label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="예) 금요일 저녁 내전"
                maxLength={60}
                disabled={creating}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-fg
                  bg-surface-2 border border-line
                  placeholder:text-faint
                  focus:outline-none focus:border-indigo-500/50
                  transition-all duration-200 disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">일자</label>
                <input
                  type="date"
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  onMouseDown={openNativePicker}
                  disabled={creating}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-fg cursor-pointer
                    bg-surface-2 border border-line
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">시간 (KST)</label>
                <input
                  type="time"
                  value={timeInput}
                  onChange={(e) => setTimeInput(e.target.value)}
                  onMouseDown={openNativePicker}
                  disabled={creating}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-fg cursor-pointer
                    bg-surface-2 border border-line
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">게임 종류</label>
              <div className="grid grid-cols-4 gap-2">
                {GAME_KIND_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setGameKind(opt.value)}
                    disabled={creating}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                      gameKind === opt.value
                        ? 'bg-indigo-500/25 border border-indigo-500/50 text-brand-ink'
                        : 'bg-surface border border-line text-subtle hover:text-muted hover:bg-surface-2'
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
                  className="mt-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-fg
                    bg-surface-2 border border-line
                    placeholder:text-faint
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              )}
              {gameKind === 'steam' && !migrationRequired && (
                <SteamGamePicker value={steamGame} onChange={setSteamGame} disabled={creating} />
              )}
              {isLol && (
                <div className="mt-2">
                  <div className="grid grid-cols-2 gap-2">
                    {LOL_MODES.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setLolMode(mode)}
                        disabled={creating}
                        className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                          lolMode === mode
                            ? 'bg-sky-500/25 border border-sky-500/50 text-brand-ink'
                            : 'bg-surface border border-line text-subtle hover:text-muted hover:bg-surface-2'
                        } disabled:opacity-50`}
                      >
                        {LOL_MODE_LABELS[mode]}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-faint">
                    {lolMode === 'rift'
                      ? '협곡은 5:5 팀 분할 + 포지션 배치를 상세에서 지원합니다 (정원 10명 고정)'
                      : '증바람은 5:5 팀 분할을 상세에서 지원합니다 (정원 10명 고정)'}
                  </p>
                </div>
              )}
              {(gameKind === 'steam' || gameKind === 'etc') && (
                <p className="mt-1.5 text-xs text-faint">
                  롤체 외 내전은 모집·참가 관리만 지원합니다 (라운드 결과 기록 없음)
                </p>
              )}
            </div>

            {gameKind === 'tft' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">게임 방식</label>
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
                              : 'bg-indigo-500/25 border border-indigo-500/50 text-brand-ink'
                            : 'bg-surface border border-line text-subtle hover:text-muted hover:bg-surface-2'
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
                  <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">최대 판수</label>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setMaxRounds(n)}
                        disabled={creating}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                          maxRounds === n
                            ? 'bg-indigo-500/25 border border-indigo-500/50 text-brand-ink'
                            : 'bg-surface border border-line text-subtle hover:text-muted hover:bg-surface-2'
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
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">정원</label>
              <input
                type="number"
                min={2}
                max={100}
                value={effectiveCapacity}
                onChange={(e) => setCapacityInput(Number(e.target.value))}
                disabled={creating || isTftTeam || isLol}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-fg
                  bg-surface-2 border border-line
                  focus:outline-none focus:border-indigo-500/50
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <p className="mt-1.5 text-xs text-faint">
                {isLol
                  ? '롤 내전은 5:5 구조라 10명 고정입니다'
                  : isTftTeam
                    ? '팀전은 8명 고정입니다'
                    : '2~100명. 정원을 넘는 신청은 자동으로 대기자가 됩니다'}
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={creating}
                className="flex-1 py-3 rounded-xl text-sm font-bold
                  bg-surface-2 border border-line text-muted
                  hover:text-fg hover:bg-surface-2
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
                  bg-indigo-500/20 border border-indigo-500/40 text-brand-ink
                  hover:bg-indigo-500/30 hover:text-brand-ink
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? <><Spinner size={4} /> 등록 중...</> : '모집 시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
