'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { Spinner } from '@/app/components/Spinner'
import { LOL_CAPACITY, LOL_POSITIONS } from '@/lib/customGames/constants'
import { formatLolRankShort, lolTierClass, positionLabel } from '@/lib/customGames/display'

const TEAM_SIZE = LOL_CAPACITY / 2 // 5
const GUEST_NAME_MAX = 20

/** 멤버 풀 소스 = 확정 명단. 롤 티어 + 추방용 참가자 id + 주최 여부. */
export type LolParticipant = {
  key: string // member_id (드래그 식별자)
  id: string // custom_game_participants.id (추방 API)
  name: string
  tier: string | null
  rank: string | null
  lp: number | null
  isHost: boolean
}

// 슬롯 3-상태: 확정 멤버 | 외부인 라벨(자유 텍스트) | 미배정.
export type LolSlot =
  | { kind: 'member'; key: string; name: string; tier: string | null; rank: string | null; lp: number | null }
  | { kind: 'guest'; key: string; name: string }
  | null

// 2팀 × 5슬롯. rift 는 슬롯 index i 가 LOL_POSITIONS[i] 포지션과 대응한다.
export type LolTeamDraft = [LolSlot[], LolSlot[]]

/** 미배치 외부인 카드. 드래그로 슬롯에 넣기 전까지 여기 머문다. */
export type LolGuestCard = { key: string; name: string }

export const EMPTY_LOL_DRAFT: LolTeamDraft = [
  [null, null, null, null, null],
  [null, null, null, null, null],
]

const TEAM_STYLES = [
  { bg: 'bg-rose-500/5 border-rose-500/25', dot: 'bg-rose-500', text: 'text-danger-ink', label: '1팀 (블루)' },
  { bg: 'bg-sky-500/5 border-sky-500/25', dot: 'bg-sky-500', text: 'text-sky-400', label: '2팀 (레드)' },
]

// 드래그 대상을 하나의 값으로 통일한다.
type Card =
  | { kind: 'member'; key: string; name: string; tier: string | null; rank: string | null; lp: number | null; isHost: boolean }
  | { kind: 'guest'; key: string; name: string }

const cardDragId = (c: Card) => `${c.kind}:${c.key}`

function CardInner({ card }: { card: Card }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      {card.kind === 'member' && card.isHost && (
        <span className="shrink-0 text-[9px] font-black px-1 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/25 text-brand-ink">
          주최
        </span>
      )}
      <span className="truncate text-sm font-bold text-fg">{card.name}</span>
      {card.kind === 'member' ? (
        <span className={`ml-auto shrink-0 text-[11px] font-black ${lolTierClass(card.tier)}`}>
          {formatLolRankShort(card.tier, card.rank, card.lp)}
        </span>
      ) : (
        <span className="ml-auto shrink-0 rounded bg-amber-500/15 border border-amber-500/25 px-1.5 py-0.5 text-[10px] font-black text-warn-ink">
          외부인
        </span>
      )}
    </div>
  )
}

/**
 * 드래그 가능한 카드. DragOverlay 대신 카드 자신에 transform 을 적용한다.
 * (DragOverlay 는 position:fixed 라 상위에 CSS transform 이 있으면 커서와 크게 어긋난다 —
 *  내전 상세는 애니메이션 transform 조상이 있어 이 방식이 안전하다.)
 */
function DraggableCard({
  card,
  disabled,
  onRemove,
}: {
  card: Card
  disabled: boolean
  onRemove?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: cardDragId(card),
    data: { card },
    disabled,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex items-center gap-1 rounded-lg border border-line bg-surface-2 pl-2.5 pr-1.5 py-2 ${
        isDragging ? 'shadow-lg border-brand/50 opacity-95' : ''
      }`}
    >
      {/* 드래그 핸들 = 카드 본문. 버튼(추방/삭제)은 리스너 밖이라 클릭이 드래그로 먹히지 않는다. */}
      <div
        {...listeners}
        {...attributes}
        className={`flex min-w-0 flex-1 items-center select-none touch-none ${
          disabled ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <CardInner card={card} />
      </div>
      {onRemove && !disabled && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={card.kind === 'guest' ? '외부인 삭제' : '명단에서 제외'}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-faint hover:text-danger-ink transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )
}

function Slot({ id, label, card, disabled }: { id: string; label: string | null; card: Card | null; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled })
  return (
    <div className="flex items-center gap-2">
      {label !== null && <span className="w-10 shrink-0 text-[10px] font-bold text-muted">{label}</span>}
      <div
        ref={setNodeRef}
        className={`min-h-[40px] flex-1 rounded-lg border px-2 py-1.5 transition-colors ${
          isOver ? 'border-brand/60 bg-brand/10' : 'border-line bg-surface'
        }`}
      >
        {card ? <DraggableCard card={card} disabled={disabled} /> : <span className="text-xs text-faint leading-[26px]">비어 있음</span>}
      </div>
    </div>
  )
}

function Pool({ children, disabled }: { children: React.ReactNode; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', disabled })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${isOver ? 'border-brand/60 bg-brand/10' : 'border-line bg-surface'}`}
    >
      {children}
    </div>
  )
}

export default function LolTeamAssignPanel({
  participants,
  guests,
  mode,
  draft,
  onChange,
  onGuestsChange,
  onKickMember,
  onRandom,
  onSave,
  saving,
  canManage,
  isClosed,
  validationError,
}: {
  participants: LolParticipant[]
  guests: LolGuestCard[]
  mode: 'aram' | 'rift'
  draft: LolTeamDraft
  onChange: (next: LolTeamDraft) => void
  onGuestsChange: (next: LolGuestCard[]) => void
  onKickMember: (memberKey: string) => void
  onRandom: () => void
  onSave: () => void
  saving: boolean
  canManage: boolean
  isClosed: boolean
  validationError: string | null
}) {
  const isRift = mode === 'rift'
  const [guestInput, setGuestInput] = useState('')

  const sensors = useSensors(
    // distance 활성 제약: 터치에서 살짝 눌러 스크롤하는 동작과 드래그를 구분한다(모바일 지원).
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  const placed = useMemo(() => {
    const members = new Set<string>()
    const guestKeys = new Set<string>()
    draft.flat().forEach((s) => {
      if (s?.kind === 'member') members.add(s.key)
      else if (s?.kind === 'guest') guestKeys.add(s.key)
    })
    return { members, guestKeys }
  }, [draft])

  // 풀 = 배치되지 않은 멤버 + 배치되지 않은 외부인.
  const poolMembers = useMemo(() => participants.filter((p) => !placed.members.has(p.key)), [participants, placed])
  const poolGuests = useMemo(() => guests.filter((g) => !placed.guestKeys.has(g.key)), [guests, placed])
  const poolCount = poolMembers.length + poolGuests.length

  const filledCount = useMemo(() => draft.flat().filter((s) => s !== null).length, [draft])
  const canRandom = participants.length === LOL_CAPACITY

  const findLocation = (card: Card): [number, number] | null => {
    for (let t = 0; t < 2; t++)
      for (let s = 0; s < TEAM_SIZE; s++) {
        const slot = draft[t][s]
        if (slot && slot.kind === card.kind && slot.key === card.key) return [t, s]
      }
    return null
  }

  const cardToSlot = (card: Card): LolSlot =>
    card.kind === 'member'
      ? { kind: 'member', key: card.key, name: card.name, tier: card.tier, rank: card.rank, lp: card.lp }
      : { kind: 'guest', key: card.key, name: card.name }

  const handleDragEnd = (e: DragEndEvent) => {
    const card = e.active.data.current?.card as Card | undefined
    if (!card || !e.over) return
    const overId = String(e.over.id)
    const from = findLocation(card)
    const next: LolTeamDraft = [[...draft[0]], [...draft[1]]]

    if (overId === 'pool') {
      if (from) next[from[0]][from[1]] = null
      onChange(next)
      return
    }
    const m = /^t(\d)s(\d)$/.exec(overId)
    if (!m) return
    const toT = Number(m[1])
    const toS = Number(m[2])
    if (from && from[0] === toT && from[1] === toS) return
    const occupant = next[toT][toS]
    next[toT][toS] = cardToSlot(card)
    if (from) next[from[0]][from[1]] = occupant // 슬롯↔슬롯 스왑
    onChange(next)
  }

  const addGuest = () => {
    const name = guestInput.trim().slice(0, GUEST_NAME_MAX)
    if (!name) return
    if (guests.some((g) => g.name.trim().toLowerCase() === name.toLowerCase())) { setGuestInput(''); return }
    const key = `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    onGuestsChange([...guests, { key, name }])
    setGuestInput('')
  }

  const memberCard = (p: LolParticipant): Card => ({
    kind: 'member', key: p.key, name: p.name, tier: p.tier, rank: p.rank, lp: p.lp, isHost: p.isHost,
  })

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-fg">팀 배정 ({isRift ? '협곡 · 포지션' : '증바람'})</h3>
          <p className="text-xs text-subtle mt-0.5">
            명단 카드를 끌어 {isRift ? '포지션별로' : '각 팀에'} 배치하세요 · 저장 버튼으로 확정됩니다
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRandom}
            disabled={saving || !canRandom}
            title={canRandom ? undefined : `확정 ${LOL_CAPACITY}명이어야 랜덤 배정할 수 있습니다`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150
              bg-sky-500/10 border border-sky-500/25 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            랜덤 배정
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || filledCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150
              bg-brand/20 border border-brand/40 text-brand-ink hover:bg-brand/30
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Spinner size={3} /> : null}
            저장
          </button>
        </div>
      </div>

      {validationError && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-danger/10 border border-danger/20 text-danger-ink text-xs font-medium">
          {validationError}
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {/* 확정 명단 = 미배치 풀(드래그 소스). 배치된 인원은 슬롯에 있으므로 여기서 빠진다. */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-black tracking-widest uppercase text-subtle">
              명단 · 미배치 ({poolCount})
            </span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={guestInput}
                onChange={(e) => setGuestInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest() } }}
                placeholder="외부인 이름 추가"
                maxLength={GUEST_NAME_MAX}
                disabled={saving}
                className="w-36 px-2 py-1 rounded-lg text-xs font-medium text-fg bg-surface-2 border border-line
                  placeholder:text-faint focus:outline-none focus:border-brand/50 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={addGuest}
                disabled={saving || !guestInput.trim()}
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-surface-2 border border-line text-fg hover:bg-surface disabled:opacity-40"
              >
                추가
              </button>
            </div>
          </div>
          <Pool disabled={saving}>
            {poolCount === 0 ? (
              <p className="text-xs text-faint">모든 인원이 배치되었습니다. 슬롯 카드를 여기로 끌면 배치가 해제됩니다.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {poolMembers.map((p) => (
                  <DraggableCard
                    key={p.key}
                    card={memberCard(p)}
                    disabled={saving}
                    onRemove={canManage && !isClosed && !p.isHost ? () => onKickMember(p.key) : undefined}
                  />
                ))}
                {poolGuests.map((g) => (
                  <DraggableCard
                    key={g.key}
                    card={{ kind: 'guest', key: g.key, name: g.name }}
                    disabled={saving}
                    onRemove={() => onGuestsChange(guests.filter((x) => x.key !== g.key))}
                  />
                ))}
              </div>
            )}
          </Pool>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([0, 1] as const).map((teamIdx) => {
            const ts = TEAM_STYLES[teamIdx]
            return (
              <div key={teamIdx} className={`rounded-xl border p-3 ${ts.bg}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${ts.dot}`} />
                  <span className={`text-[10px] font-black tracking-widest uppercase ${ts.text}`}>{ts.label}</span>
                </div>
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: TEAM_SIZE }).map((_, slotIdx) => {
                    const slot = draft[teamIdx][slotIdx]
                    const card: Card | null = slot
                      ? slot.kind === 'member'
                        ? { kind: 'member', key: slot.key, name: slot.name, tier: slot.tier, rank: slot.rank, lp: slot.lp, isHost: participants.find((p) => p.key === slot.key)?.isHost ?? false }
                        : { kind: 'guest', key: slot.key, name: slot.name }
                      : null
                    return (
                      <Slot
                        key={slotIdx}
                        id={`t${teamIdx}s${slotIdx}`}
                        label={isRift ? positionLabel(LOL_POSITIONS[slotIdx]) : null}
                        card={card}
                        disabled={saving}
                      />
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </DndContext>

      <div className="mt-3 flex items-center gap-1.5">
        {Array.from({ length: LOL_CAPACITY }).map((_, i) => (
          <div key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i < filledCount ? 'bg-brand' : 'bg-surface-2'}`} />
        ))}
        <span className="text-[10px] text-faint ml-1">{filledCount}/{LOL_CAPACITY}명 배정</span>
      </div>
    </div>
  )
}
