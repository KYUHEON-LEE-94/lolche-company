'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Spinner } from '@/app/components/Spinner'
import Link from 'next/link'
import { TFT_TEAM_CAPACITY } from '@/lib/customGames/constants'
import { effectiveMemberCapacity } from '@/lib/customGames/waitlist'
import {
  formatKstSchedule,
  formatKstShort,
  gameKindBadgeClass,
  gameKindLabel,
  statusBadgeClass,
  statusLabel,
  toKstDateInput,
  toKstTimeInput,
} from '@/lib/customGames/display'

// ── 타입 ────────────────────────────────────────────────────────────────────

type GameDetail = {
  id: string
  title: string
  status: string
  game_type: string
  game_kind: string
  game_kind_label: string | null
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

type MyParticipation = { id: string; position: number; confirmed: boolean } | null

// teamDraft: 4팀 × 2슬롯 = [[slot0, slot1], ...]  null = 미배정
type TeamDraft = [string | null, string | null][]

// ── 상수 ────────────────────────────────────────────────────────────────────

const PLACEMENT_STYLE: Record<number, { bg: string; text: string }> = {
  1: { bg: 'bg-yellow-500/15 border border-yellow-500/30', text: 'text-yellow-300' },
  2: { bg: 'bg-slate-400/15 border border-slate-400/30', text: 'text-slate-300' },
  3: { bg: 'bg-orange-500/15 border border-orange-500/30', text: 'text-orange-300' },
}

const TEAM_COLORS = [
  { bg: 'bg-rose-500/15 border-rose-500/30', text: 'text-rose-300', dot: 'bg-rose-500', label: '팀 1' },
  { bg: 'bg-sky-500/15 border-sky-500/30', text: 'text-sky-300', dot: 'bg-sky-500', label: '팀 2' },
  { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-300', dot: 'bg-emerald-500', label: '팀 3' },
  { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-300', dot: 'bg-amber-500', label: '팀 4' },
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
  if (!result) return <span className="text-slate-700 text-xs">-</span>
  const s = PLACEMENT_STYLE[result.placement] ?? {
    bg: 'bg-white/[0.04] border border-white/[0.07]',
    text: 'text-slate-400',
  }
  const tc = teamIndex !== undefined ? TEAM_COLORS[teamIndex - 1] : undefined
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${s.bg} ${s.text}`}>
        {result.placement}등
      </span>
      <span className="text-[10px] text-slate-600 font-medium">{result.points}점</span>
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
          <p className="text-xs text-slate-500 mt-0.5">각 팀에 2명씩 배정하세요</p>
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
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
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
                    className="w-full mb-1.5 last:mb-0 px-2 py-1.5 rounded-lg text-xs font-medium text-white
                      bg-black/20 border border-white/10
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
        <span className="text-[10px] text-slate-600 ml-1">{assignedKeys.size}/{TFT_TEAM_CAPACITY}명 배정</span>
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
  const [savingEdit, setSavingEdit] = useState(false)

  // 팀 배정 상태
  const [teamDraft, setTeamDraft] = useState<TeamDraft>(EMPTY_DRAFT)
  const [savingTeams, setSavingTeams] = useState(false)
  const [teamSaveError, setTeamSaveError] = useState<string | null>(null)

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
      setCanManage(Boolean(body.can_manage))
      setMyParticipation(body.my_participation ?? null)
    } catch { setLoadError('알 수 없는 오류가 발생했습니다') }
    finally { setLoading(false) }
  }, [gameId])

  useEffect(() => { loadDetail() }, [loadDetail])

  const isTft = game?.game_kind === 'tft'
  const isTeam = isTft && game?.game_type === 'team'
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
        background: tone === 'confirmed' ? 'rgba(255,255,255,0.03)' : 'rgba(249,115,22,0.05)',
        borderColor: tone === 'confirmed' ? 'rgba(255,255,255,0.07)' : 'rgba(249,115,22,0.15)',
      }}
    >
      <span className={`text-[10px] font-black w-5 text-center ${tone === 'confirmed' ? 'text-slate-600' : 'text-orange-400'}`}>
        {tone === 'confirmed' ? p.position : p.position - confirmedList.length}
      </span>
      <div>
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-bold text-white leading-tight">{p.member_name}</p>
          {p.is_host && (
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25 text-indigo-400">
              주최
            </span>
          )}
        </div>
        <p className="text-[10px] text-slate-600">{p.riot_game_name}#{p.riot_tagline}</p>
      </div>
      {isTft && tone === 'confirmed' && !p.riot_puuid && (
        <span className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-bold">
          PUUID 없음
        </span>
      )}
      {canManage && !isClosed && !p.is_host && (
        <button
          type="button"
          onClick={() => handleKick(p)}
          disabled={kickingId === p.id}
          className="ml-1 w-5 h-5 flex items-center justify-center rounded-md
            text-slate-600 hover:text-red-400 hover:bg-red-500/10
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
    <div className="min-h-screen flex flex-col" style={{ background: '#07090f' }}>
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(99,102,241,0.12) 0%, transparent 70%)' }}
      />

      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: 'rgba(7,9,15,0.85)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/custom-games"
              className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                <path d="M15 19l-7-7 7-7" />
              </svg>
              내전 목록
            </Link>
            {game && (
              <>
                <span className="text-slate-700 flex-shrink-0">·</span>
                <span className="text-sm font-black text-white truncate">{game.title}</span>
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
                    bg-emerald-500/10 border border-emerald-500/30 text-emerald-400
                    hover:bg-emerald-500/20 hover:text-emerald-300
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
                    bg-white/[0.04] border border-white/[0.08] text-slate-400
                    hover:text-slate-200 hover:bg-white/[0.07]
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
                    bg-white/[0.04] border border-white/[0.08] text-slate-400
                    hover:text-slate-200 hover:bg-white/[0.07]"
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
                    bg-indigo-500/10 border border-indigo-500/30 text-indigo-400
                    hover:bg-indigo-500/20 hover:text-indigo-300
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
                    bg-red-500/10 border border-red-500/20 text-red-400
                    hover:bg-red-500/20 hover:text-red-300
                    disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {ending ? <><Spinner size={4} /> 종료 중...</> : '내전 종료'}
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="relative z-10 flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div
          className="rounded-2xl border p-8"
          style={{ background: 'rgba(13,17,23,0.9)', borderColor: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}
        >
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
              <Spinner size={6} />
              <p className="text-sm font-semibold">로딩 중...</p>
            </div>
          )}

          {!loading && !game && (
            <div className="text-center py-20">
              <p className="text-slate-400 font-bold">{loadError ?? '내전을 찾을 수 없습니다'}</p>
              <Link href="/custom-games" className="text-indigo-400 text-sm mt-2 inline-block hover:underline">← 목록으로</Link>
            </div>
          )}

          {!loading && game && (
            <>
              {/* 타이틀 */}
              <div className="mb-8">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h1 className="text-2xl font-black text-white tracking-tight">{game.title}</h1>
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
                  <Badge className={statusBadgeClass(game.status)}>{statusLabel(game.status)}</Badge>
                  {myParticipation && (
                    <Badge className={myParticipation.confirmed
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}>
                      {myParticipation.confirmed ? '참가 확정' : `대기 ${myParticipation.position - confirmedList.length}번`}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  {formatKstSchedule(game.scheduled_at)} · 주최 {game.host_member_name ?? '알 수 없음'}
                </p>
                <p className="text-sm text-slate-500 mt-0.5">
                  {seatsTaken}/{game.capacity}명
                  {guests.length > 0 && ` (게스트 ${guests.length}명 포함)`}
                  {waitlist.length > 0 && ` · 대기 ${waitlist.length}명`}
                  {isTft && ` · 최대 ${game.max_rounds}판 · ${rounds.length}판 완료`}
                </p>
              </div>

              {addingRound && (
                <div className="mb-6 flex items-center gap-3 px-4 py-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm">
                  <Spinner size={4} />
                  <div>
                    <p className="font-bold">Riot API에서 게임 정보를 가져오는 중입니다</p>
                    <p className="text-indigo-400/70 text-xs mt-0.5">참가자 전원이 함께한 최근 게임을 탐색합니다. 10~20초 정도 걸릴 수 있습니다.</p>
                  </div>
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

              {/* 명단 */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-xs font-black text-slate-500 tracking-widest uppercase">
                    확정 명단 ({seatsTaken}/{game.capacity})
                  </h2>
                  {isTft && !isClosed && canManage && canAddGuest && !showGuestForm && (
                    <button
                      type="button"
                      onClick={() => setShowGuestForm(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                        text-xs font-bold transition-all duration-150
                        bg-amber-500/10 border border-amber-500/20 text-amber-400
                        hover:bg-amber-500/20 hover:text-amber-300"
                    >
                      게스트 추가
                    </button>
                  )}
                </div>

                {isTft && showGuestForm && (
                  <div
                    className="mb-4 p-4 rounded-xl border"
                    style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.15)' }}
                  >
                    <p className="text-xs font-black text-amber-400 tracking-widest uppercase mb-3">게스트 추가</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="표시 이름 (예: 홍길동 부계)"
                        disabled={addingGuest}
                        className="flex-1 px-3 py-2 rounded-lg text-sm text-white
                          bg-white/[0.04] border border-white/[0.08]
                          placeholder:text-slate-600
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
                        className="flex-1 px-3 py-2 rounded-lg text-sm text-white
                          bg-white/[0.04] border border-white/[0.08]
                          placeholder:text-slate-600
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
                            bg-amber-500/15 border border-amber-500/25 text-amber-400
                            hover:bg-amber-500/25 hover:text-amber-300
                            disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {addingGuest ? <Spinner size={4} /> : '추가'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setShowGuestForm(false); setGuestName(''); setGuestRiotId('') }}
                          disabled={addingGuest}
                          className="px-3 py-2 rounded-lg text-sm font-bold
                            text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]
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
                    <p className="text-sm text-slate-600">아직 참가자가 없습니다</p>
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
                          <p className="text-sm font-bold text-white leading-tight">{g.display_name}</p>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-amber-400">
                            게스트
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-600 font-mono">{g.riot_puuid.slice(0, 16)}…</p>
                      </div>
                      {canManage && !isClosed && (
                        <button
                          type="button"
                          onClick={() => handleRemoveGuest(g.id, g.display_name)}
                          disabled={removingGuestId === g.id}
                          className="ml-1 w-5 h-5 flex items-center justify-center rounded-md
                            text-slate-600 hover:text-red-400 hover:bg-red-500/10
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
                  <h2 className="text-xs font-black text-slate-500 tracking-widest uppercase mb-3">
                    대기 명단 ({waitlist.length}명)
                  </h2>
                  <p className="text-xs text-slate-600 mb-2">
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
                      style={{ borderColor: 'rgba(255,255,255,0.07)' }}
                    >
                      <p className="text-slate-400 font-bold mb-1">아직 기록된 라운드가 없습니다</p>
                      <p className="text-slate-600 text-sm text-center">
                        {isTeam ? '팀을 배정하고 저장한 뒤 [라운드 추가] 버튼을 눌러 결과를 기록하세요' : 'TFT 게임 플레이 후 [라운드 추가] 버튼을 눌러 결과를 기록하세요'}
                      </p>
                    </div>
                  )}

                  {rounds.length > 0 && (
                    <div className="rounded-2xl border overflow-hidden mb-8" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                      <div className="overflow-x-auto">
                        <table className="min-w-full border-collapse">
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                              <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-500 tracking-widest uppercase w-8">순위</th>
                              <th className="px-4 py-3.5 text-left text-[10px] font-black text-slate-500 tracking-widest uppercase">참가자</th>
                              {rounds.map((r) => (
                                <th key={r.id} className="px-4 py-3.5 text-center text-[10px] font-black text-slate-500 tracking-widest uppercase min-w-[90px]">
                                  {r.round_number}판
                                </th>
                              ))}
                              {Array.from({ length: Math.max(0, game.max_rounds - rounds.length) }).map((_, i) => (
                                <th key={`empty-${i}`} className="px-4 py-3.5 text-center text-[10px] font-black text-slate-700 tracking-widest uppercase min-w-[90px]">
                                  {rounds.length + i + 1}판
                                </th>
                              ))}
                              <th className="px-4 py-3.5 text-center text-[10px] font-black text-indigo-500 tracking-widest uppercase min-w-[72px]">총점</th>
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
                                    background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                                  }}
                                >
                                  <td className="px-4 py-3.5 text-center">
                                    <span className={`text-sm font-black ${
                                      rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-orange-400' : 'text-slate-600'
                                    }`}>{rank}</span>
                                  </td>
                                  <td className="px-4 py-3.5">
                                    <div className="flex items-center gap-2">
                                      <div>
                                        <p className="text-sm font-bold text-white leading-tight">{p.name}</p>
                                        <p className="text-xs text-slate-600">{p.subLabel}</p>
                                      </div>
                                      {p.isGuest && (
                                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-500/25 text-amber-400">
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
                                      <span className="text-slate-800 text-xs">-</span>
                                    </td>
                                  ))}
                                  <td className="px-4 py-3.5 text-center">
                                    <span className={`text-base font-black ${
                                      rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-slate-300' : rank === 3 ? 'text-orange-400' : 'text-white'
                                    }`}>{totalPoints}</span>
                                    <span className="text-slate-600 text-xs ml-0.5">점</span>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-5 py-3 flex items-center justify-between" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                        <span className="text-xs text-slate-600 font-medium">
                          {rounds.length}/{game.max_rounds}판 완료 · {isTeam ? '팀 합산점수 (1등=8점 기준)' : '1등=8점, 8등=1점'}
                        </span>
                        {isClosed && game.ended_at && (
                          <span className="text-xs text-slate-600">종료: {formatKstShort(game.ended_at)}</span>
                        )}
                      </div>
                    </div>
                  )}

                  {isTeam && rounds.length > 0 && (
                    <div className="mb-8">
                      <h2 className="text-xs font-black text-slate-500 tracking-widest uppercase mb-3">라운드별 팀 구성</h2>
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
                            <div key={r.id} className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}>
                              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{r.round_number}라운드</div>
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
                                      <span className="text-xs text-white/70">
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

              {!isTft && (
                <p className="text-sm text-slate-600">
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
            style={{ background: 'rgb(13,17,23)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <h2 className="text-lg font-black text-white">내전 수정</h2>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">제목</label>
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                maxLength={60}
                disabled={savingEdit}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-white
                  bg-white/[0.04] border border-white/[0.08]
                  focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">일자</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  disabled={savingEdit}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-white
                    bg-white/[0.04] border border-white/[0.08]
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">시간 (KST)</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  disabled={savingEdit}
                  className="w-full px-3 py-3 rounded-xl text-sm font-medium text-white
                    bg-white/[0.04] border border-white/[0.08]
                    focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">정원</label>
              <input
                type="number"
                min={2}
                max={100}
                value={editCapacity}
                onChange={(e) => setEditCapacity(Number(e.target.value))}
                disabled={savingEdit || isTeam}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-white
                  bg-white/[0.04] border border-white/[0.08]
                  focus:outline-none focus:border-indigo-500/50
                  disabled:opacity-50 disabled:cursor-not-allowed"
              />
              {isTeam && <p className="mt-1.5 text-xs text-slate-600">팀전은 8명 고정입니다</p>}
              {demotedCount > 0 && (
                <p className="mt-1.5 text-xs text-orange-400">
                  정원을 줄이면 확정자 {demotedCount}명이 대기자로 이동합니다
                </p>
              )}
            </div>

            {isTft && (
              <div>
                <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">최대 판수</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setEditMaxRounds(n)}
                      disabled={savingEdit}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                        editMaxRounds === n
                          ? 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300'
                          : 'bg-white/[0.03] border border-white/[0.07] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
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
                  bg-white/[0.04] border border-white/[0.07] text-slate-400
                  hover:text-slate-200 hover:bg-white/[0.07]
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
                  bg-indigo-500/20 border border-indigo-500/40 text-indigo-300
                  hover:bg-indigo-500/30 hover:text-indigo-200
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
