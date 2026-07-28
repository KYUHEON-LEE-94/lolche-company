'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Spinner } from '@/app/components/Spinner'
import Link from 'next/link'
import Image from 'next/image'
import SteamGamePicker, { type SteamGameSelection } from '@/app/custom-games/_components/SteamGamePicker'
import LolTeamAssignPanel, {
  EMPTY_LOL_DRAFT,
  type LolSlot,
  type LolTeamDraft,
} from '@/app/custom-games/_components/LolTeamAssignPanel'
import { LOL_POSITIONS, TFT_TEAM_CAPACITY } from '@/lib/customGames/constants'
import { effectiveMemberCapacity } from '@/lib/customGames/waitlist'
import {
  formatKstSchedule,
  formatKstShort,
  gameKindBadgeClass,
  gameKindLabel,
  lolModeLabel,
  openNativePicker,
  positionLabel,
  statusBadgeClass,
  statusLabel,
  steamCapsuleUrl,
  toKstDateInput,
  toKstTimeInput,
} from '@/lib/customGames/display'
import { CONTAINER, PANEL } from '@/lib/ui/styles'

// ── 타입 ────────────────────────────────────────────────────────────────────

type GameDetail = {
  id: string
  title: string
  status: string
  game_type: string
  game_kind: string
  game_kind_label: string | null
  steam_app_id: number | null
  lol_mode: string | null
  max_rounds: number
  capacity: number
  scheduled_at: string | null
  host_member_id: string | null
  host_member_name: string | null
  created_at: string
  ended_at: string | null
}

type MemberParticipant = {
  id: string
  member_id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  riot_puuid: string | null
  joined_at: string
  position: number
  confirmed: boolean
  is_host: boolean
}

type GuestParticipant = {
  id: string
  display_name: string
  riot_puuid: string
}

type AnyParticipant = {
  key: string
  name: string
  subLabel: string
  puuid: string | null
  isGuest: boolean
}

type RoundResult = { member_id: string; placement: number; points: number }
type GuestResult = { guest_id: string; placement: number; points: number }

type Round = {
  id: string
  round_number: number
  match_id: string
  played_at: string | null
  results: RoundResult[]
  guest_results: GuestResult[]
}

type TeamRow = {
  round_number: number
  team_index: number
  member_id: string | null
  guest_id: string | null
}

type LolTeamRow = {
  team_index: number
  member_id: string | null
  guest_id: string | null
  guest_name: string | null
  position: string | null
}

type MemberOption = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
}

type MyParticipation = { id: string; position: number; confirmed: boolean } | null

// teamDraft: 4팀 × 2슬롯 = [[slot0, slot1], ...]  null = 미배정
type TeamDraft = [string | null, string | null][]

// ── 상수 ────────────────────────────────────────────────────────────────────

const PLACEMENT_STYLE: Record<number, { bg: string; text: string }> = {
  1: { bg: 'bg-yellow-500/15 border border-yellow-500/30', text: 'text-yellow-300' },
  2: { bg: 'bg-slate-400/15 border border-slate-400/30', text: 'text-muted' },
  3: { bg: 'bg-orange-500/15 border border-orange-500/30', text: 'text-orange-300' },
}

const TEAM_COLORS = [
  { bg: 'bg-rose-500/15 border-rose-500/30', text: 'text-danger-ink', dot: 'bg-rose-500', label: '팀 1' },
  { bg: 'bg-sky-500/15 border-sky-500/30', text: 'text-sky-300', dot: 'bg-sky-500', label: '팀 2' },
  { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-ok-ink', dot: 'bg-emerald-500', label: '팀 3' },
  { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-warn-ink', dot: 'bg-amber-500', label: '팀 4' },
]

const EMPTY_DRAFT: TeamDraft = [[null, null], [null, null], [null, null], [null, null]]

// ── 헬퍼 컴포넌트 ─────────────────────────────────────────────────────────────

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold border ${className}`}>
      {children}
    </span>
  )
}

function PlacementCell({ result, teamIndex }: {
  result: { placement: number; points: number } | undefined
  teamIndex?: number
}) {
  if (!result) return <span className="text-faint text-xs">-</span>
  const s = PLACEMENT_STYLE[result.placement] ?? {
    bg: 'bg-surface-2 border border-line',
    text: 'text-muted',
  }
  const tc = teamIndex !== undefined ? TEAM_COLORS[teamIndex - 1] : undefined
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${s.bg} ${s.text}`}>
        {result.placement}등
      </span>
      <span className="text-[10px] text-faint font-medium">{result.points}점</span>
      {tc && (
        <span className={`inline-flex items-center px-1.5 py-0 rounded text-[9px] font-black border ${tc.bg} ${tc.text}`}>
          {tc.label}
        </span>
      )}
    </div>
  )
}

// ── 팀 배정 섹션 ──────────────────────────────────────────────────────────────

function TeamAssignPanel({
  allParticipants,
  draft,
  onChange,
  onRandom,
  onSave,
  saving,
  roundNumber,
  validationError,
}: {
  allParticipants: AnyParticipant[]
  draft: TeamDraft
  onChange: (next: TeamDraft) => void
  onRandom: () => void
  onSave: () => void
  saving: boolean
  roundNumber: number
  validationError: string | null
}) {
  const assignedKeys = useMemo(() => new Set(draft.flat().filter(Boolean) as string[]), [draft])
  const isDraftFull = assignedKeys.size === TFT_TEAM_CAPACITY && draft.every(t => t[0] !== null && t[1] !== null)

  const handleSlotChange = (teamIdx: number, slotIdx: number, newKey: string | null) => {
    const next: TeamDraft = draft.map(t => [...t] as [string | null, string | null])
    if (newKey) {
      next.forEach((team, ti) => {
        team.forEach((k, si) => {
          if (k === newKey && !(ti === teamIdx && si === slotIdx)) {
            next[ti][si] = null
          }
        })
      })
    }
    next[teamIdx][slotIdx] = newKey
    onChange(next)
  }

  return (
    <div className="rounded-2xl border p-5 mb-6" style={{ background: 'rgba(139,92,246,0.04)', borderColor: 'rgba(139,92,246,0.18)' }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-violet-300">{roundNumber}라운드 팀 배정</h3>
          <p className="text-xs text-subtle mt-0.5">각 팀에 2명씩 배정하세요</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRandom}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              text-xs font-bold transition-all duration-150
              bg-violet-500/10 border border-violet-500/25 text-violet-400
              hover:bg-violet-500/20 hover:text-violet-300
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            랜덤 배정
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || !isDraftFull}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              text-xs font-bold transition-all duration-150
              bg-violet-500/20 border border-violet-500/40 text-violet-300
              hover:bg-violet-500/30 hover:text-violet-200
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Spinner size={3} /> : null}
            저장
          </button>
        </div>
      </div>

      {validationError && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-danger-ink text-xs font-medium">
          {validationError}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {draft.map((team, teamIdx) => {
          const tc = TEAM_COLORS[teamIdx]
          return (
            <div key={teamIdx} className={`rounded-xl border p-3 ${tc.bg}`} style={{ borderColor: 'transparent' }}>
              <div className={`text-[10px] font-black mb-2 tracking-widest uppercase ${tc.text}`}>
                {tc.label}
              </div>
              {[0, 1].map((slotIdx) => {
                const currentKey = team[slotIdx]
                return (
                  <select
                    key={slotIdx}
                    value={currentKey ?? ''}
                    onChange={(e) => handleSlotChange(teamIdx, slotIdx, e.target.value || null)}
                    disabled={saving}
                    className="w-full mb-1.5 last:mb-0 px-2 py-1.5 rounded-lg text-xs font-medium text-fg
                      bg-black/20 border border-line
                      focus:outline-none focus:border-violet-500/50
                      disabled:opacity-50 transition-colors"
                  >
                    <option value="">선수 선택</option>
                    {allParticipants
                      .filter((p) => p.key === currentKey || !assignedKeys.has(p.key))
                      .map((p) => (
                        <option key={p.key} value={p.key}>{p.name}</option>
                      ))}
                  </select>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {Array.from({ length: TFT_TEAM_CAPACITY }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i < assignedKeys.size ? 'bg-violet-500' : 'bg-slate-700'
            }`}
          />
        ))}
        <span className="text-[10px] text-faint ml-1">{assignedKeys.size}/{TFT_TEAM_CAPACITY}명 배정</span>
      </div>
    </div>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function CustomGameDetailPage() {
  const params = useParams()
  const gameId = params.id as string

  const [game, setGame] = useState<GameDetail | null>(null)
  const [confirmedList, setConfirmedList] = useState<MemberParticipant[]>([])
  const [waitlist, setWaitlist] = useState<MemberParticipant[]>([])
  const [guests, setGuests] = useState<GuestParticipant[]>([])
  const [rounds, setRounds] = useState<Round[]>([])
  const [teams, setTeams] = useState<TeamRow[]>([])
  const [lolTeams, setLolTeams] = useState<LolTeamRow[]>([])
  const [canManage, setCanManage] = useState(false)
  const [myParticipation, setMyParticipation] = useState<MyParticipation>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [addingRound, setAddingRound] = useState(false)
  const [ending, setEnding] = useState(false)
  const [joining, setJoining] = useState(false)
  const [kickingId, setKickingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // 게스트 추가 폼 상태
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestRiotId, setGuestRiotId] = useState('')
  const [addingGuest, setAddingGuest] = useState(false)
  const [removingGuestId, setRemovingGuestId] = useState<string | null>(null)

  // 수정 폼 상태
  const [showEdit, setShowEdit] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editCapacity, setEditCapacity] = useState(8)
  const [editMaxRounds, setEditMaxRounds] = useState(5)
  const [editSteamGame, setEditSteamGame] = useState<SteamGameSelection>({ label: '', appId: null })
  const [savingEdit, setSavingEdit] = useState(false)
  const [migrationRequired, setMigrationRequired] = useState(false)

  // 팀 배정 상태
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(EMPTY_DRAFT)
  const [savingTeams, setSavingTeams] = useState(false)
  const [teamSaveError, setTeamSaveError] = useState<string | null>(null)

  // 롤 팀 배정 상태
  const [lolDraft, setLolDraft] = useState<LolTeamDraft>(EMPTY_LOL_DRAFT)
  const [savingLolTeams, setSavingLolTeams] = useState(false)
  const [lolTeamError, setLolTeamError] = useState<string | null>(null)

  // 관리자 멤버 추가 상태
  const [showMemberAdd, setShowMemberAdd] = useState(false)
  const [memberQuery, setMemberQuery] = useState('')
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null)

  const showMsg = useCallback((type: 'error' | 'success', msg: string) => {
    if (type === 'error') { setError(msg); setSuccessMsg(null) }
    else { setSuccessMsg(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccessMsg(null) }, 5000)
  }, [])

  const loadDetail = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}`)
      const body = await res.json()
      if (!res.ok) { setLoadError(body.error ?? '로드 실패'); setGame(null); return }
      setLoadError(null)
      setGame(body.game)
      setConfirmedList(body.confirmed ?? [])
      setWaitlist(body.waitlist ?? [])
      setGuests(body.guests ?? [])
      setRounds(body.rounds ?? [])
      setTeams(body.teams ?? [])
      setLolTeams(body.lol_teams ?? [])
      setCanManage(Boolean(body.can_manage))
      setMyParticipation(body.my_participation ?? null)
      setMigrationRequired(Boolean(body.migration_required))
    } catch { setLoadError('알 수 없는 오류가 발생했습니다') }
    finally { setLoading(false) }
  }, [gameId])

  useEffect(() => { loadDetail() }, [loadDetail])

  const isTft = game?.game_kind === 'tft'
  const isTeam = isTft && game?.game_type === 'team'
  const isLol = game?.game_kind === 'lol'
  const isRift = isLol && game?.lol_mode === 'rift'
  const isClosed = game?.status === 'ended' || game?.status === 'cancelled'
  const isRecruiting = game?.status === 'recruiting'

  // ── 팀 드래프트 초기화 ─────────────────────────────────────────────
  useEffect(() => {
    if (!isTeam) return
    const nextRound = rounds.length + 1
    const existing = teams.filter((t) => t.round_number === nextRound)
    if (existing.length > 0) {
      const next: TeamDraft = [[null, null], [null, null], [null, null], [null, null]]
      existing.forEach((t) => {
        const key = t.member_id ?? t.guest_id
        if (!key) return
        const teamIdx = t.team_index - 1
        if (next[teamIdx][0] === null) next[teamIdx][0] = key
        else next[teamIdx][1] = key
      })
      setTeamDraft(next)
    } else {
      setTeamDraft(EMPTY_DRAFT)
    }
    setTeamSaveError(null)
  }, [teams, rounds.length, isTeam])

  // ── 롤 팀 드래프트 초기화 ──────────────────────────────────────────
  useEffect(() => {
    if (!isLol) return
    if (lolTeams.length === 0) {
      setLolDraft(EMPTY_LOL_DRAFT)
      setLolTeamError(null)
      return
    }
    const next: LolTeamDraft = [
      [null, null, null, null, null],
      [null, null, null, null, null],
    ]
    lolTeams.forEach((t) => {
      // 슬롯은 확정 멤버(member_id) 또는 외부인 라벨(guest_name) 중 하나로 채워진다.
      const slotValue: LolSlot = t.member_id
        ? {
            kind: 'member',
            key: t.member_id,
            name:
              confirmedList.find((p) => p.member_id === t.member_id)?.member_name
              ?? waitlist.find((p) => p.member_id === t.member_id)?.member_name
              ?? '알 수 없음',
          }
        : t.guest_name
          ? { kind: 'guest', name: t.guest_name }
          : null
      if (!slotValue) return
      const teamIdx = t.team_index - 1
      if (teamIdx !== 0 && teamIdx !== 1) return
      // 협곡은 포지션으로 슬롯을 고정하고, 증바람은 빈 슬롯 순서대로 채운다.
      const slotPos = isRift && t.position ? LOL_POSITIONS.indexOf(t.position as (typeof LOL_POSITIONS)[number]) : -1
      if (slotPos >= 0) {
        next[teamIdx][slotPos] = slotValue
      } else {
        const empty = next[teamIdx].findIndex((v) => v === null)
        if (empty >= 0) next[teamIdx][empty] = slotValue
      }
    })
    setLolDraft(next)
    setLolTeamError(null)
  }, [lolTeams, isLol, isRift, confirmedList, waitlist])

  // ── 데이터 계산 ───────────────────────────────────────────────────

  const allParticipants: AnyParticipant[] = useMemo(() => [
    ...confirmedList.map((p) => ({
      key: p.member_id,
      name: p.member_name,
      subLabel: `${p.riot_game_name}#${p.riot_tagline}`,
      puuid: p.riot_puuid,
      isGuest: false,
    })),
    ...guests.map((g) => ({
      key: g.id,
      name: g.display_name,
      subLabel: '게스트',
      puuid: g.riot_puuid,
      isGuest: true,
    })),
  ], [confirmedList, guests])

  // 롤 팀 배정은 게스트 없이 확정 멤버만 대상으로 한다.
  const lolParticipants = useMemo(
    () => confirmedList.map((p) => ({ key: p.member_id, name: p.member_name })),
    [confirmedList],
  )

  // ── 이벤트 핸들러 ─────────────────────────────────────────────────

  const handleJoin = async () => {
    setJoining(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/join`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '신청 실패'); return }
      showMsg('success', body.confirmed ? '참가가 확정되었습니다' : `대기 ${body.position}번으로 신청되었습니다`)
      await loadDetail()
    } catch { showMsg('error', '신청 중 오류가 발생했습니다') }
    finally { setJoining(false) }
  }

  const handleLeave = async () => {
    if (!confirm('참가를 취소하시겠습니까?')) return
    setJoining(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/join`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '취소 실패'); return }
      showMsg('success', '참가가 취소되었습니다')
      await loadDetail()
    } catch { showMsg('error', '취소 중 오류가 발생했습니다') }
    finally { setJoining(false) }
  }

  const handleKick = async (p: MemberParticipant) => {
    if (!confirm(`${p.member_name}님을 명단에서 제외하시겠습니까?`)) return
    setKickingId(p.id)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/participants/${p.id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '제외 실패'); return }
      showMsg('success', '명단에서 제외되었습니다')
      await loadDetail()
    } catch { showMsg('error', '제외 중 오류가 발생했습니다') }
    finally { setKickingId(null) }
  }

  const handleOpenEdit = () => {
    if (!game) return
    setEditTitle(game.title)
    setEditDate(toKstDateInput(game.scheduled_at))
    setEditTime(toKstTimeInput(game.scheduled_at))
    setEditCapacity(game.capacity)
    setEditMaxRounds(game.max_rounds)
    setEditSteamGame({ label: game.game_kind_label ?? '', appId: game.steam_app_id })
    setShowEdit(true)
  }

  const handleSaveEdit = async () => {
    if (!game) return
    setSavingEdit(true)
    try {
      // 일자·시간은 문자열 그대로 전송한다 (서버가 KST 오프셋을 붙여 변환).
      const res = await fetch(`/api/custom-games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle.trim(),
          scheduled_date: editDate,
          scheduled_time: editTime,
          capacity: editCapacity,
          ...(isTft ? { max_rounds: editMaxRounds } : {}),
          ...(game.game_kind === 'steam'
            ? {
                game_kind_label: editSteamGame.label.trim() || null,
                steam_app_id: editSteamGame.appId,
              }
            : {}),
        }),
      })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '수정 실패'); return }
      setShowEdit(false)
      showMsg('success', '수정되었습니다')
      await loadDetail()
    } catch { showMsg('error', '수정 중 오류가 발생했습니다') }
    finally { setSavingEdit(false) }
  }

  const handleAddRound = async () => {
    setAddingRound(true)
    setError(null)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/rounds`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '라운드 추가 실패'); return }
      showMsg('success', `${body.round_number}라운드가 기록되었습니다!`)
      await loadDetail()
    } catch { showMsg('error', '라운드 추가 중 오류가 발생했습니다') }
    finally { setAddingRound(false) }
  }

  const handleEnd = async () => {
    if (!confirm('내전을 종료하시겠습니까?')) return
    setEnding(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/end`, { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '종료 실패'); return }
      showMsg('success', '내전이 종료되었습니다')
      await loadDetail()
    } catch { showMsg('error', '종료 중 오류가 발생했습니다') }
    finally { setEnding(false) }
  }

  const handleAddGuest = async () => {
    if (!guestName.trim()) { showMsg('error', '표시 이름을 입력하세요'); return }
    const parts = guestRiotId.trim().split('#')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      showMsg('error', 'Riot ID 형식이 올바르지 않습니다 (예: 닉네임#KR1)')
      return
    }
    setAddingGuest(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          display_name: guestName.trim(),
          riot_game_name: parts[0].trim(),
          riot_tagline: parts[1].trim(),
        }),
      })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '게스트 추가 실패'); return }
      showMsg('success', `${guestName.trim()} 게스트가 추가되었습니다`)
      setGuestName('')
      setGuestRiotId('')
      setShowGuestForm(false)
      await loadDetail()
    } catch { showMsg('error', '게스트 추가 중 오류가 발생했습니다') }
    finally { setAddingGuest(false) }
  }

  const handleRemoveGuest = async (guestId: string, name: string) => {
    const hasResults = rounds.some((r) => r.guest_results.some((gr) => gr.guest_id === guestId))
    const msg = hasResults
      ? `${name}을(를) 삭제하면 해당 게스트의 라운드 기록도 함께 삭제됩니다. 계속하시겠습니까?`
      : `${name} 게스트를 삭제하시겠습니까?`
    if (!confirm(msg)) return
    setRemovingGuestId(guestId)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/guests/${guestId}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '삭제 실패'); return }
      showMsg('success', '게스트가 삭제되었습니다')
      await loadDetail()
    } catch { showMsg('error', '삭제 중 오류가 발생했습니다') }
    finally { setRemovingGuestId(null) }
  }

  const handleRandomTeams = async () => {
    setSavingTeams(true)
    setTeamSaveError(null)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_number: rounds.length + 1, random: true }),
      })
      const body = await res.json()
      if (!res.ok) { setTeamSaveError(body.error ?? '랜덤 배정 실패'); return }

      const next: TeamDraft = [[null, null], [null, null], [null, null], [null, null]]
      ;(body.assignments as { team_index: number; member_id?: string; guest_id?: string }[]).forEach((a) => {
        const key = a.member_id ?? a.guest_id
        if (!key) return
        const teamIdx = a.team_index - 1
        if (next[teamIdx][0] === null) next[teamIdx][0] = key
        else next[teamIdx][1] = key
      })
      setTeamDraft(next)
      await loadDetail()
    } catch { setTeamSaveError('랜덤 배정 중 오류가 발생했습니다') }
    finally { setSavingTeams(false) }
  }

  const handleSaveTeams = async () => {
    setSavingTeams(true)
    setTeamSaveError(null)
    const assignments = teamDraft.flatMap((team, teamIdx) =>
      team
        .filter((key): key is string => key !== null)
        .map((key) => {
          const p = allParticipants.find((ap) => ap.key === key)
          return p?.isGuest
            ? { team_index: teamIdx + 1, guest_id: key }
            : { team_index: teamIdx + 1, member_id: key }
        }),
    )
    try {
      const res = await fetch(`/api/custom-games/${gameId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round_number: rounds.length + 1, assignments }),
      })
      const body = await res.json()
      if (!res.ok) { setTeamSaveError(body.error ?? '저장 실패'); return }
      showMsg('success', `${rounds.length + 1}라운드 팀 배정이 저장되었습니다`)
      await loadDetail()
    } catch { setTeamSaveError('저장 중 오류가 발생했습니다') }
    finally { setSavingTeams(false) }
  }

  // ── 롤 팀 배정 핸들러 ─────────────────────────────────────────────
  const handleSaveLolTeams = async () => {
    setSavingLolTeams(true)
    setLolTeamError(null)
    const assignments = lolDraft.flatMap((team, teamIdx) =>
      team
        .map((slot, slotIdx) => ({ slot, slotIdx }))
        .filter((s): s is { slot: NonNullable<LolSlot>; slotIdx: number } => s.slot !== null)
        .map((s) => ({
          team_index: teamIdx + 1,
          ...(s.slot.kind === 'member'
            ? { member_id: s.slot.key }
            : { guest_name: s.slot.name }),
          ...(isRift ? { position: LOL_POSITIONS[s.slotIdx] } : {}),
        })),
    )
    try {
      const res = await fetch(`/api/custom-games/${gameId}/lol-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments }),
      })
      const body = await res.json()
      if (!res.ok) { setLolTeamError(body.error ?? '저장 실패'); return }
      showMsg('success', '팀 배정이 저장되었습니다')
      await loadDetail()
    } catch { setLolTeamError('저장 중 오류가 발생했습니다') }
    finally { setSavingLolTeams(false) }
  }

  const handleRandomLolTeams = async () => {
    setSavingLolTeams(true)
    setLolTeamError(null)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/lol-teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ random: true }),
      })
      const body = await res.json()
      if (!res.ok) { setLolTeamError(body.error ?? '랜덤 배정 실패'); return }
      await loadDetail()
    } catch { setLolTeamError('랜덤 배정 중 오류가 발생했습니다') }
    finally { setSavingLolTeams(false) }
  }

  // ── 관리자 멤버 직접 추가 핸들러 ──────────────────────────────────
  const loadMemberOptions = useCallback(async (q: string) => {
    setLoadingOptions(true)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/member-options?q=${encodeURIComponent(q)}`)
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '멤버 목록 로드 실패'); return }
      setMemberOptions(body.members ?? [])
    } catch { showMsg('error', '멤버 목록 로드 중 오류가 발생했습니다') }
    finally { setLoadingOptions(false) }
  }, [gameId, showMsg])

  const handleAddMember = async (memberId: string) => {
    setAddingMemberId(memberId)
    try {
      const res = await fetch(`/api/custom-games/${gameId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member_id: memberId }),
      })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '추가 실패'); return }
      showMsg('success', '멤버가 추가되었습니다')
      await Promise.all([loadDetail(), loadMemberOptions(memberQuery)])
    } catch { showMsg('error', '추가 중 오류가 발생했습니다') }
    finally { setAddingMemberId(null) }
  }

  // 관리자 멤버 추가 패널이 열려 있는 동안만 후보를 조회한다(검색어 디바운스).
  useEffect(() => {
    if (!showMemberAdd) return
    const t = setTimeout(() => { loadMemberOptions(memberQuery) }, 250)
    return () => clearTimeout(t)
  }, [showMemberAdd, memberQuery, loadMemberOptions])

  // ── 파생 값 ───────────────────────────────────────────────────────

  const nextRoundNumber = rounds.length + 1
  const teamsForNextRound = teams.filter((t) => t.round_number === nextRoundNumber)
  const teamsAssigned = isTeam ? teamsForNextRound.length === TFT_TEAM_CAPACITY : true
  const canAddRound = isTft && !isClosed && rounds.length < (game?.max_rounds ?? 5) && teamsAssigned
  const seatsTaken = confirmedList.length + guests.length
  const canAddGuest = isTft && !isClosed && game !== null && seatsTaken < game.capacity

  const scoreMap = new Map<string, number>()
  allParticipants.forEach((p) => scoreMap.set(p.key, 0))
  rounds.forEach((r) => {
    r.results.forEach((res) => {
      scoreMap.set(res.member_id, (scoreMap.get(res.member_id) ?? 0) + res.points)
    })
    r.guest_results.forEach((res) => {
      scoreMap.set(res.guest_id, (scoreMap.get(res.guest_id) ?? 0) + res.points)
    })
  })

  const sortedParticipants = [...allParticipants].sort(
    (a, b) => (scoreMap.get(b.key) ?? 0) - (scoreMap.get(a.key) ?? 0),
  )

  const resultMap = new Map<string, Map<string, { placement: number; points: number }>>()
  rounds.forEach((r) => {
    const inner = new Map<string, { placement: number; points: number }>()
    r.results.forEach((res) => inner.set(res.member_id, res))
    r.guest_results.forEach((res) => inner.set(res.guest_id, res))
    resultMap.set(r.id, inner)
  })

  const teamMapByRound = useMemo(() => {
    const map = new Map<number, Map<string, number>>()
    teams.forEach((t) => {
      if (!map.has(t.round_number)) map.set(t.round_number, new Map())
      const key = t.member_id ?? t.guest_id
      if (!key) return
      map.get(t.round_number)!.set(key, t.team_index)
    })
    return map
  }, [teams])

  // 정원 하향 시 확정자 중 몇 명이 대기자로 밀리는지 (B-R12)
  const demotedCount = game
    ? Math.max(0, confirmedList.length - effectiveMemberCapacity(editCapacity, guests.length))
    : 0

  const renderParticipantRow = (p: MemberParticipant, tone: 'confirmed' | 'waitlist') => (
    <div
      key={p.id}
      className="flex items-center gap-2 px-3 py-2 rounded-xl border"
      style={{
        background: tone === 'confirmed' ? 'var(--color-surface)' : 'rgba(249,115,22,0.05)',
        borderColor: tone === 'confirmed' ? 'var(--color-line)' : 'rgba(249,115,22,0.15)',
      }}
    >
      <span className={`text-[10px] font-black w-5 text-center ${tone === 'confirmed' ? 'text-faint' : 'text-orange-400'}`}>
        {tone === 'confirmed' ? p.position : p.position - confirmedList.length}
      </span>
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-fg leading-tight">{p.member_name}</p>
          {p.is_host && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25 text-brand-ink">
              주최
            </span>
          )}
        </div>
        <p className="text-[10px] text-faint">{p.riot_game_name}#{p.riot_tagline}</p>
      </div>
      {isTft && tone === 'confirmed' && !p.riot_puuid && (
        <span className="text-[10px] text-danger-ink bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">
          PUUID 없음
        </span>
      )}
      {canManage && !isClosed && !p.is_host && (
        <button
          type="button"
          onClick={() => handleKick(p)}
          disabled={kickingId === p.id}
          className="ml-1 w-5 h-5 flex items-center justify-center rounded-md
            text-faint hover:text-danger-ink hover:bg-red-500/10
            disabled:opacity-40 transition-colors"
          title="명단에서 제외"
        >
          {kickingId === p.id ? <Spinner size={3} /> : (
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </button>
      )}
    </div>
  )

  // ── 렌더 ─────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/custom-games"
              className="flex items-center gap-1.5 text-sm font-bold text-muted hover:text-fg transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                <path d="M15 19l-7-7 7-7" />
              </svg>
              내전 목록
            </Link>
            {game && (
              <>
                <span className="text-faint flex-shrink-0">·</span>
                <span className="text-sm font-black text-fg truncate">{game.title}</span>
              </>
            )}
          </div>

          {game && !isClosed && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {isRecruiting && !myParticipation && (
                <button
                  type="button"
                  onClick={handleJoin}
                  disabled={joining}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                    text-sm font-bold transition-all duration-200
                    bg-emerald-500/10 border border-emerald-500/30 text-ok-ink
                    hover:bg-emerald-500/20 hover:text-ok-ink
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {joining ? <Spinner size={4} /> : null}
                  {seatsTaken >= game.capacity ? '대기 신청' : '참가 신청'}
                </button>
              )}
              {isRecruiting && myParticipation && (
                <button
                  type="button"
                  onClick={handleLeave}
                  disabled={joining}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                    text-sm font-bold transition-all duration-200
                    bg-surface-2 border border-line text-muted
                    hover:text-fg hover:bg-surface-2
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {joining ? <Spinner size={4} /> : null}
                  참가 취소
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={handleOpenEdit}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                    text-sm font-bold transition-all duration-200
                    bg-surface-2 border border-line text-muted
                    hover:text-fg hover:bg-surface-2"
                >
                  수정
                </button>
              )}
              {canManage && isTft && (
                <button
                  type="button"
                  onClick={handleAddRound}
                  disabled={addingRound || ending || !canAddRound}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                    text-sm font-bold transition-all duration-200
                    bg-indigo-500/10 border border-indigo-500/30 text-brand-ink
                    hover:bg-indigo-500/20 hover:text-brand-ink
                    disabled:opacity-40 disabled:cursor-not-allowed"
                  title={isTeam && !teamsAssigned ? '팀 배정을 먼저 저장하세요' : undefined}
                >
                  {addingRound ? <><Spinner size={4} /> 탐색 중...</> : (isTeam && !teamsAssigned ? '팀 배정 필요' : '라운드 추가')}
                </button>
              )}
              {canManage && (
                <button
                  type="button"
                  onClick={handleEnd}
                  disabled={addingRound || ending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
                    text-sm font-bold transition-all duration-200
                    bg-red-500/10 border border-red-500/20 text-danger-ink
                    hover:bg-red-500/20 hover:text-danger-ink
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ending ? <><Spinner size={4} /> 종료 중...</> : '내전 종료'}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className={`relative z-10 flex-1 w-full px-4 py-8 ${CONTAINER}`}>
        <div className={PANEL}>
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-subtle">
              <Spinner size={6} />
              <p className="text-sm font-semibold">로딩 중...</p>
            </div>
          )}

          {!loading && !game && (
            <div className="text-center py-20">
              <p className="text-muted font-bold">{loadError ?? '내전을 찾을 수 없습니다'}</p>
              <Link href="/custom-games" className="text-brand-ink text-sm mt-2 inline-block hover:underline">← 목록으로</Link>
            </div>
          )}

          {!loading && game && (
            <>
              {/* 타이틀 */}
              <div className="mb-8">
                {game.game_kind === 'steam' && game.steam_app_id != null && (
                  <div className="relative mb-3 h-[42px] w-[110px] overflow-hidden rounded-lg border border-line bg-surface-2">
                    <Image
                      src={steamCapsuleUrl(game.steam_app_id)}
                      alt=""
                      fill
                      sizes="110px"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h1 className="text-2xl font-black text-fg tracking-tight">{game.title}</h1>
                  <Badge className={gameKindBadgeClass(game.game_kind)}>
                    {gameKindLabel(game.game_kind, game.game_kind_label)}
                  </Badge>
                  {isTft && (
                    <Badge className={isTeam
                      ? 'bg-violet-500/10 border-violet-500/20 text-violet-400'
                      : 'bg-blue-500/10 border-blue-500/20 text-blue-400'}>
                      {isTeam ? '2인 팀전' : '개인전'}
                    </Badge>
                  )}
                  {isLol && game.lol_mode && (
                    <Badge className="bg-sky-500/10 border-sky-500/20 text-sky-400">
                      {lolModeLabel(game.lol_mode)}
                    </Badge>
                  )}
                  <Badge className={statusBadgeClass(game.status)}>{statusLabel(game.status)}</Badge>
                  {myParticipation && (
                    <Badge className={myParticipation.confirmed
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-ok-ink'
                      : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}>
                      {myParticipation.confirmed ? '참가 확정' : `대기 ${myParticipation.position - confirmedList.length}번`}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-subtle">
                  {formatKstSchedule(game.scheduled_at)} · 주최 {game.host_member_name ?? '알 수 없음'}
                </p>
                <p className="text-sm text-subtle mt-0.5">
                  {seatsTaken}/{game.capacity}명
                  {guests.length > 0 && ` (게스트 ${guests.length}명 포함)`}
                  {waitlist.length > 0 && ` · 대기 ${waitlist.length}명`}
                  {isTft && ` · 최대 ${game.max_rounds}판 · ${rounds.length}판 완료`}
                </p>
              </div>

              {addingRound && (
                <div className="mb-6 flex items-center gap-3 px-4 py-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-brand-ink text-sm">
                  <Spinner size={4} />
                  <div>
                    <p className="font-bold">Riot API에서 게임 정보를 가져오는 중입니다</p>
                    <p className="text-brand-ink/70 text-xs mt-0.5">참가자 전원이 함께한 최근 게임을 탐색합니다. 10~20초 정도 걸릴 수 있습니다.</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-danger-ink text-sm font-medium">
                  {error}
                </div>
              )}
              {successMsg && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-ok-ink text-sm font-medium">
                  {successMsg}
                </div>
              )}

              {/* 명단 */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-black text-subtle tracking-widest uppercase">
                    확정 명단 ({seatsTaken}/{game.capacity})
                  </h2>
                  <div className="flex items-center gap-2">
                    {canManage && !isClosed && (
                      <button
                        type="button"
                        onClick={() => setShowMemberAdd((v) => !v)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                          text-xs font-bold transition-all duration-150
                          bg-brand/10 border border-brand/25 text-brand-ink
                          hover:bg-brand/20"
                      >
                        멤버 추가
                      </button>
                    )}
                    {isTft && !isClosed && canManage && canAddGuest && !showGuestForm && (
                      <button
                        type="button"
                        onClick={() => setShowGuestForm(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                          text-xs font-bold transition-all duration-150
                          bg-amber-500/10 border border-amber-500/20 text-warn-ink
                          hover:bg-amber-500/20 hover:text-warn-ink"
                      >
                        게스트 추가
                      </button>
                    )}
                  </div>
                </div>

                {canManage && !isClosed && showMemberAdd && (
                  <div className="mb-4 p-4 rounded-xl border border-line bg-surface">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-black text-brand-ink tracking-widest uppercase">승인 멤버 추가</p>
                      <button
                        type="button"
                        onClick={() => { setShowMemberAdd(false); setMemberQuery('') }}
                        className="text-xs font-bold text-subtle hover:text-muted transition-colors"
                      >
                        닫기
                      </button>
                    </div>
                    <input
                      type="text"
                      value={memberQuery}
                      onChange={(e) => setMemberQuery(e.target.value)}
                      placeholder="멤버 이름 검색"
                      className="w-full mb-3 px-3 py-2 rounded-lg text-sm text-fg
                        bg-surface-2 border border-line
                        placeholder:text-faint
                        focus:outline-none focus:border-brand/50 transition-colors"
                    />
                    {loadingOptions ? (
                      <div className="flex items-center gap-2 text-subtle text-sm py-3">
                        <Spinner size={4} /> 불러오는 중...
                      </div>
                    ) : memberOptions.length === 0 ? (
                      <p className="text-sm text-faint py-2">추가할 수 있는 승인 멤버가 없습니다</p>
                    ) : (
                      <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                        {memberOptions.map((m) => (
                          <div
                            key={m.id}
                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-line bg-surface-2"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-fg leading-tight truncate">{m.member_name}</p>
                              <p className="text-[10px] text-faint truncate">
                                {m.riot_game_name ? `${m.riot_game_name}#${m.riot_tagline}` : '라이엇 ID 미등록'}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddMember(m.id)}
                              disabled={addingMemberId === m.id}
                              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                text-xs font-bold transition-all duration-150
                                bg-emerald-500/10 border border-emerald-500/25 text-ok-ink
                                hover:bg-emerald-500/20 hover:text-ok-ink
                                disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {addingMemberId === m.id ? <Spinner size={3} /> : '추가'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {isTft && showGuestForm && (
                  <div
                    className="mb-4 p-4 rounded-xl border"
                    style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.15)' }}
                  >
                    <p className="text-xs font-black text-warn-ink tracking-widest uppercase mb-3">게스트 추가</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="표시 이름 (예: 홍길동 부계)"
                        disabled={addingGuest}
                        className="flex-1 px-3 py-2 rounded-lg text-sm text-fg
                          bg-surface-2 border border-line
                          placeholder:text-faint
                          focus:outline-none focus:border-amber-500/40
                          disabled:opacity-50 transition-colors"
                      />
                      <input
                        type="text"
                        value={guestRiotId}
                        onChange={(e) => setGuestRiotId(e.target.value)}
                        placeholder="Riot ID (닉네임#태그)"
                        disabled={addingGuest}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuest() }}
                        className="flex-1 px-3 py-2 rounded-lg text-sm text-fg
                          bg-surface-2 border border-line
                          placeholder:text-faint
                          focus:outline-none focus:border-amber-500/40
                          disabled:opacity-50 transition-colors"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleAddGuest}
                          disabled={addingGuest || !guestName.trim() || !guestRiotId.trim()}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                            text-sm font-bold transition-all duration-150
                            bg-amber-500/15 border border-amber-500/25 text-warn-ink
                            hover:bg-amber-500/25 hover:text-warn-ink
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {addingGuest ? <Spinner size={4} /> : '추가'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowGuestForm(false); setGuestName(''); setGuestRiotId('') }}
                          disabled={addingGuest}
                          className="px-3 py-2 rounded-lg text-sm font-bold
                            text-subtle hover:text-muted hover:bg-surface-2
                            disabled:opacity-40 transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {confirmedList.length === 0 && guests.length === 0 && (
                    <p className="text-sm text-faint">아직 참가자가 없습니다</p>
                  )}
                  {confirmedList.map((p) => renderParticipantRow(p, 'confirmed'))}

                  {isTft && guests.map((g) => (
                    <div
                      key={g.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                      style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.15)' }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold text-fg leading-tight">{g.display_name}</p>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-warn-ink">
                            게스트
                          </span>
                        </div>
                        <p className="text-[10px] text-faint font-mono">{g.riot_puuid.slice(0, 16)}…</p>
                      </div>
                      {canManage && !isClosed && (
                        <button
                          type="button"
                          onClick={() => handleRemoveGuest(g.id, g.display_name)}
                          disabled={removingGuestId === g.id}
                          className="ml-1 w-5 h-5 flex items-center justify-center rounded-md
                            text-faint hover:text-danger-ink hover:bg-red-500/10
                            disabled:opacity-40 transition-colors"
                          title="게스트 삭제"
                        >
                          {removingGuestId === g.id ? <Spinner size={3} /> : (
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                              <path d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* 대기 명단 */}
              {waitlist.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-xs font-black text-subtle tracking-widest uppercase mb-3">
                    대기 명단 ({waitlist.length}명)
                  </h2>
                  <p className="text-xs text-faint mb-2">
                    확정 인원이 취소하면 순번대로 자동 확정됩니다
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {waitlist.map((p) => renderParticipantRow(p, 'waitlist'))}
                  </div>
                </div>
              )}

              {/* ── 아래는 TFT 내전에서만 렌더한다 (라운드·팀·결과) ───────── */}
              {isTft && (
                <>
                  {isTeam && canManage && !isClosed && rounds.length < game.max_rounds && (
                    <TeamAssignPanel
                      allParticipants={allParticipants}
                      draft={teamDraft}
                      onChange={setTeamDraft}
                      onRandom={handleRandomTeams}
                      onSave={handleSaveTeams}
                      saving={savingTeams}
                      roundNumber={nextRoundNumber}
                      validationError={teamSaveError}
                    />
                  )}

                  {rounds.length === 0 && (
                    <div
                      className="flex flex-col items-center justify-center py-16 border border-dashed rounded-2xl mb-6"
                      style={{ borderColor: 'var(--color-line)' }}
                    >
                      <p className="text-muted font-bold mb-1">아직 기록된 라운드가 없습니다</p>
                      <p className="text-faint text-sm text-center">
                        {isTeam ? '팀을 배정하고 저장한 뒤 [라운드 추가] 버튼을 눌러 결과를 기록하세요' : 'TFT 게임 플레이 후 [라운드 추가] 버튼을 눌러 결과를 기록하세요'}
                      </p>
                    </div>
                  )}

                  {rounds.length > 0 && (
                    <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor: 'var(--color-line)' }}>
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr style={{ background: 'var(--color-surface)', borderBottom: '1px solid var(--color-line)' }}>
                              <th className="px-4 py-3.5 text-left text-[10px] font-black text-subtle tracking-widest uppercase w-8">순위</th>
                              <th className="px-4 py-3.5 text-left text-[10px] font-black text-subtle tracking-widest uppercase">참가자</th>
                              {rounds.map((r) => (
                                <th key={r.id} className="px-4 py-3.5 text-center text-[10px] font-black text-subtle tracking-widest uppercase min-w-[90px]">
                                  {r.round_number}판
                                </th>
                              ))}
                              {Array.from({ length: Math.max(0, game.max_rounds - rounds.length) }).map((_, i) => (
                                <th key={`empty-${i}`} className="px-4 py-3.5 text-center text-[10px] font-black text-faint tracking-widest uppercase min-w-[90px]">
                                  {rounds.length + i + 1}판
                                </th>
                              ))}
                              <th className="px-4 py-3.5 text-center text-[10px] font-black text-brand-ink tracking-widest uppercase min-w-[72px]">총점</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedParticipants.map((p, idx) => {
                              const totalPoints = scoreMap.get(p.key) ?? 0
                              const rank = idx + 1
                              return (
                                <tr
                                  key={p.key}
                                  style={{
                                    background: idx % 2 === 0 ? 'transparent' : 'var(--color-surface)',
                                    borderBottom: '1px solid var(--color-line)',
                                  }}
                                >
                                  <td className="px-4 py-3.5 text-center">
                                    <span className={`text-sm font-black ${
                                      rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-muted' : rank === 3 ? 'text-orange-400' : 'text-faint'
                                    }`}>{rank}</span>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-2">
                                      <div>
                                        <p className="text-sm font-bold text-fg leading-tight">{p.name}</p>
                                        <p className="text-xs text-faint">{p.subLabel}</p>
                                      </div>
                                      {p.isGuest && (
                                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-warn-ink">
                                          게스트
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  {rounds.map((r) => {
                                    const teamIdx = isTeam ? teamMapByRound.get(r.round_number)?.get(p.key) : undefined
                                    return (
                                      <td key={r.id} className="px-4 py-3.5 text-center">
                                        <PlacementCell result={resultMap.get(r.id)?.get(p.key)} teamIndex={teamIdx} />
                                      </td>
                                    )
                                  })}
                                  {Array.from({ length: Math.max(0, game.max_rounds - rounds.length) }).map((_, i) => (
                                    <td key={`empty-${i}`} className="px-4 py-3.5 text-center">
                                      <span className="text-faint text-xs">-</span>
                                    </td>
                                  ))}
                                  <td className="px-4 py-3.5 text-center">
                                    <span className={`text-base font-black ${
                                      rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-muted' : rank === 3 ? 'text-orange-400' : 'text-fg'
                                    }`}>{totalPoints}</span>
                                    <span className="text-faint text-xs ml-0.5">점</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--color-line)', background: 'var(--color-surface)' }}>
                        <span className="text-xs text-faint font-medium">
                          {rounds.length}/{game.max_rounds}판 완료 · {isTeam ? '팀 합산점수 (1등=8점 기준)' : '1등=8점, 8등=1점'}
                        </span>
                        {isClosed && game.ended_at && (
                          <span className="text-xs text-subtle">종료: {formatKstShort(game.ended_at)}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {isTeam && rounds.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-xs font-black text-subtle tracking-widest uppercase mb-3">라운드별 팀 구성</h2>
                      <div className="flex flex-col gap-3">
                        {rounds.map((r) => {
                          const roundTeamMap = teamMapByRound.get(r.round_number)
                          if (!roundTeamMap) return null
                          const teamGroups = new Map<number, AnyParticipant[]>()
                          allParticipants.forEach((p) => {
                            const ti = roundTeamMap.get(p.key)
                            if (ti !== undefined) {
                              const arr = teamGroups.get(ti) ?? []
                              arr.push(p)
                              teamGroups.set(ti, arr)
                            }
                          })
                          return (
                            <div key={r.id} className="rounded-xl border p-3" style={{ background: 'var(--color-surface)', borderColor: 'var(--color-line)' }}>
                              <div className="text-[10px] font-black text-subtle uppercase tracking-widest mb-2">{r.round_number}라운드</div>
                              <div className="flex flex-wrap gap-2">
                                {[1, 2, 3, 4].map((ti) => {
                                  const teamMembers = teamGroups.get(ti) ?? []
                                  const tc = TEAM_COLORS[ti - 1]
                                  return (
                                    <div
                                      key={ti}
                                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${tc.bg}`}
                                      style={{ borderColor: 'transparent' }}
                                    >
                                      <div className={`w-1.5 h-1.5 rounded-full ${tc.dot}`} />
                                      <span className={`text-xs font-black ${tc.text}`}>{tc.label}</span>
                                      <span className="text-xs text-muted">
                                        {teamMembers.map((m) => m.name).join(' + ')}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ── 롤 내전: 팀/포지션 배정 (전용 경로, TFT 로직과 분리) ───── */}
              {isLol && (
                <>
                  {canManage && !isClosed && (
                    <LolTeamAssignPanel
                      participants={lolParticipants}
                      mode={isRift ? 'rift' : 'aram'}
                      draft={lolDraft}
                      onChange={setLolDraft}
                      onRandom={handleRandomLolTeams}
                      onSave={handleSaveLolTeams}
                      saving={savingLolTeams}
                      validationError={lolTeamError}
                    />
                  )}

                  {lolTeams.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-xs font-black text-subtle tracking-widest uppercase mb-3">팀 구성</h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {([1, 2] as const).map((teamIndex) => {
                          const rows = lolTeams
                            .filter((t) => t.team_index === teamIndex && (t.member_id || t.guest_name))
                            .sort((a, b) => {
                              if (!isRift) return 0
                              return LOL_POSITIONS.indexOf(a.position as (typeof LOL_POSITIONS)[number]) -
                                LOL_POSITIONS.indexOf(b.position as (typeof LOL_POSITIONS)[number])
                            })
                          const ts = teamIndex === 1
                            ? { bg: 'bg-rose-500/10 border-rose-500/25', dot: 'bg-rose-500', text: 'text-danger-ink', label: '1팀 (블루)' }
                            : { bg: 'bg-sky-500/10 border-sky-500/25', dot: 'bg-sky-500', text: 'text-sky-400', label: '2팀 (레드)' }
                          return (
                            <div key={teamIndex} className={`rounded-xl border p-3 ${ts.bg}`}>
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${ts.dot}`} />
                                <span className={`text-[10px] font-black tracking-widest uppercase ${ts.text}`}>{ts.label}</span>
                              </div>
                              <div className="flex flex-col gap-1">
                                {rows.length === 0 && <p className="text-xs text-faint">미배정</p>}
                                {rows.map((t) => (
                                  <div key={`${t.member_id ?? t.guest_name}-${t.position ?? ''}`} className="flex items-center gap-2 text-sm">
                                    {isRift && (
                                      <span className="w-10 text-[10px] font-bold text-muted shrink-0">
                                        {positionLabel(t.position)}
                                      </span>
                                    )}
                                    <span className="font-bold text-fg">
                                      {t.member_id
                                        ? confirmedList.find((p) => p.member_id === t.member_id)?.member_name
                                          ?? waitlist.find((p) => p.member_id === t.member_id)?.member_name
                                          ?? '알 수 없음'
                                        : t.guest_name ?? '알 수 없음'}
                                    </span>
                                    {!t.member_id && t.guest_name && (
                                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-warn-ink">
                                        외부인
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {!isTft && !isLol && (
                <p className="text-sm text-faint">
                  {gameKindLabel(game.game_kind, game.game_kind_label)} 내전은 모집·참가 관리만 지원합니다.
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {/* 수정 모달 — 서버가 권한을 강제하므로 이 노출 제어는 UX 목적이다 */}
      {showEdit && game && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => !savingEdit && setShowEdit(false)}
          />
          <div
            className="relative w-full max-w-lg rounded-2xl border p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto"
            style={{ background: 'var(--color-panel)', borderColor: 'var(--color-line)' }}
          >
            <h2 className="text-lg font-black text-fg">내전 수정</h2>

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">제목</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={60}
                disabled={savingEdit}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-fg
                  bg-surface-2 border border-line
                  focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">일자</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  onClick={openNativePicker}
                  disabled={savingEdit}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-fg cursor-pointer
                    bg-surface-2 border border-line
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">시간 (KST)</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  onClick={openNativePicker}
                  disabled={savingEdit}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-fg cursor-pointer
                    bg-surface-2 border border-line
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
            </div>

            {game.game_kind === 'steam' && !migrationRequired && (
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">게임</label>
                <SteamGamePicker
                  value={editSteamGame}
                  onChange={setEditSteamGame}
                  disabled={savingEdit}
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">정원</label>
              <input
                type="number"
                min={2}
                max={100}
                value={editCapacity}
                onChange={(e) => setEditCapacity(Number(e.target.value))}
                disabled={savingEdit || isTeam}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-fg
                  bg-surface-2 border border-line
                  focus:outline-none focus:border-indigo-500/50
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isTeam && <p className="mt-1.5 text-xs text-faint">팀전은 8명 고정입니다</p>}
              {demotedCount > 0 && (
                <p className="mt-1.5 text-xs text-orange-400">
                  정원을 줄이면 확정자 {demotedCount}명이 대기자로 이동합니다
                </p>
              )}
            </div>

            {isTft && (
              <div>
                <label className="block text-xs font-bold text-muted mb-2 tracking-widest uppercase">최대 판수</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEditMaxRounds(n)}
                      disabled={savingEdit}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                        editMaxRounds === n
                          ? 'bg-indigo-500/25 border border-indigo-500/50 text-brand-ink'
                          : 'bg-surface border border-line text-subtle hover:text-muted hover:bg-surface-2'
                      } disabled:opacity-50`}
                    >
                      {n}판
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowEdit(false)}
                disabled={savingEdit}
                className="flex-1 py-3 rounded-xl text-sm font-bold
                  bg-surface-2 border border-line text-muted
                  hover:text-fg hover:bg-surface-2
                  disabled:opacity-40 transition-all"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={savingEdit || !editTitle.trim() || !editDate || !editTime}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl
                  text-sm font-bold transition-all duration-200
                  bg-indigo-500/20 border border-indigo-500/40 text-brand-ink
                  hover:bg-indigo-500/30 hover:text-brand-ink
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {savingEdit ? <><Spinner size={4} /> 저장 중...</> : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
