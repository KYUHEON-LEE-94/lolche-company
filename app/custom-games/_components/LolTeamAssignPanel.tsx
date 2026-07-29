'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { Spinner } from '@/app/components/Spinner'
import { LOL_CAPACITY, LOL_POSITIONS } from '@/lib/customGames/constants'
import { formatLolRankShort, lolTierClass, positionLabel } from '@/lib/customGames/display'

const TEAM_SIZE = LOL_CAPACITY / 2 // 5
const GUEST_NAME_MAX = 20

/** 멤버 풀 소스. 확정 명단 멤버 + 롤 티어. */
export type LolParticipant = {
  key: string
  name: string
  tier: string | null
  rank: string | null
  lp: number | null
}

// 슬롯 3-상태: 확정 멤버 | 외부인 라벨(자유 텍스트) | 미배정.
// key 는 드래그 식별자로도 쓴다(member=member_id, guest=클라이언트 id).
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

// ── 카드 값 ──────────────────────────────────────────────────────────────────
// 드래그 대상은 항상 이 값으로 표현한다. member/guest 를 하나의 카드로 통일한다.
type Card =
  | { kind: 'member'; key: string; name: string; tier: string | null; rank: string | null; lp: number | null }
  | { kind: 'guest'; key: string; name: string }

const cardDragId = (c: Card) => `${c.kind}:${c.key}`
const slotToCard = (s: LolSlot): Card | null => (s ? { ...s } : null)

function CardBody({ card }: { card: Card }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
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

// ── 드래그 가능한 카드 ─────────────────────────────────────────────────────────
function DraggableCard({ card, disabled }: { card: Card; disabled: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: cardDragId(card),
    data: { card },
    disabled,
  })
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`rounded-lg border border-line bg-surface-2 px-2.5 py-2 select-none touch-none ${
        disabled ? '' : 'cursor-grab active:cursor-grabbing'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <CardBody card={card} />
    </div>
  )
}

// ── 드롭 가능한 슬롯 ───────────────────────────────────────────────────────────
function Slot({
  id,
  label,
  card,
  disabled,
}: {
  id: string
  label: string | null
  card: Card | null
  disabled: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled })
  return (
    <div className="flex items-center gap-2">
      {label !== null && (
        <span className="w-10 shrink-0 text-[10px] font-bold text-muted">{label}</span>
      )}
      <div
        ref={setNodeRef}
        className={`min-h-[38px] flex-1 rounded-lg border px-2 py-1.5 transition-colors ${
          isOver ? 'border-brand/60 bg-brand/10' : 'border-line bg-surface'
        }`}
      >
        {card ? <DraggableCard card={card} disabled={disabled} /> : (
          <span className="text-xs text-faint leading-[26px]">비어 있음</span>
        )}
      </div>
    </div>
  )
}

// ── 풀(미배치) 드롭 영역 ───────────────────────────────────────────────────────
function Pool({ cards, disabled }: { cards: Card[]; disabled: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool', disabled })
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border p-3 transition-colors ${
        isOver ? 'border-brand/60 bg-brand/10' : 'border-line bg-surface'
      }`}
    >
      {cards.length === 0 ? (
        <p className="text-xs text-faint">배치되지 않은 인원이 없습니다. 카드를 여기로 끌면 배치가 해제됩니다.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cards.map((c) => (
            <DraggableCard key={cardDragId(c)} card={c} disabled={disabled} />
          ))}
        </div>
      )}
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
  onRandom,
  onSave,
  saving,
  validationError,
}: {
  participants: LolParticipant[]
  guests: LolGuestCard[]
  mode: 'aram' | 'rift'
  draft: LolTeamDraft
  onChange: (next: LolTeamDraft) => void
  onGuestsChange: (next: LolGuestCard[]) => void
  onRandom: () => void
  onSave: () => void
  saving: boolean
  validationError: string | null
}) {
  const isRift = mode === 'rift'
  const [guestInput, setGuestInput] = useState('')
  const [activeCard, setActiveCard] = useState<Card | null>(null)

  const sensors = useSensors(
    // distance 활성 제약: 터치에서 살짝 눌러 스크롤하는 동작과 드래그를 구분한다(모바일 지원).
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  )

  // 슬롯에 배치된 key 집합(멤버/게스트 각각).
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
  const poolCards: Card[] = useMemo(() => {
    const memberCards: Card[] = participants
      .filter((p) => !placed.members.has(p.key))
      .map((p) => ({ kind: 'member', key: p.key, name: p.name, tier: p.tier, rank: p.rank, lp: p.lp }))
    const guestCards: Card[] = guests
      .filter((g) => !placed.guestKeys.has(g.key))
      .map((g) => ({ kind: 'guest', key: g.key, name: g.name }))
    return [...memberCards, ...guestCards]
  }, [participants, guests, placed])

  const filledCount = useMemo(() => draft.flat().filter((s) => s !== null).length, [draft])
  const canRandom = participants.length === LOL_CAPACITY

  // 드래그 카드의 현재 위치를 찾는다. 슬롯이면 [teamIdx, slotIdx], 풀이면 null.
  const findLocation = (card: Card): [number, number] | null => {
    for (let t = 0; t < 2; t++) {
      for (let s = 0; s < TEAM_SIZE; s++) {
        const slot = draft[t][s]
        if (slot && slot.kind === card.kind && slot.key === card.key) return [t, s]
      }
    }
    return null
  }

  const cardToSlot = (card: Card): LolSlot =>
    card.kind === 'member'
      ? { kind: 'member', key: card.key, name: card.name, tier: card.tier, rank: card.rank, lp: card.lp }
      : { kind: 'guest', key: card.key, name: card.name }

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveCard(null)
    const card = e.active.data.current?.card as Card | undefined
    if (!card || !e.over) return
    const overId = String(e.over.id)
    const from = findLocation(card)

    const next: LolTeamDraft = [[...draft[0]], [...draft[1]]]

    if (overId === 'pool') {
      // 슬롯 → 풀: 배치 해제.
      if (from) next[from[0]][from[1]] = null
      onChange(next)
      return
    }

    // overId = "t{team}s{slot}"
    const m = /^t(\d)s(\d)$/.exec(overId)
    if (!m) return
    const toT = Number(m[1])
    const toS = Number(m[2])
    const occupant = next[toT][toS]

    // 같은 자리면 무시.
    if (from && from[0] === toT && from[1] === toS) return

    next[toT][toS] = cardToSlot(card)
    if (from) {
      // 슬롯 → 슬롯: 기존 점유자를 원래 자리로 교환(스왑).
      next[from[0]][from[1]] = occupant
    }
    // 풀 → 슬롯: 점유자가 있으면 풀로 밀려남(자동 — 슬롯에서 빠지면 풀에 다시 나타난다).
    onChange(next)
  }

  const addGuest = () => {
    const name = guestInput.trim().slice(0, GUEST_NAME_MAX)
    if (!name) return
    // 이름 중복(대소문자 무시) 방지 — 서버 규칙과 동일.
    const dup = guests.some((g) => g.name.trim().toLowerCase() === name.toLowerCase())
    if (dup) { setGuestInput(''); return }
    const key = `g-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
    onGuestsChange([...guests, { key, name }])
    setGuestInput('')
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-fg">팀 배정 ({isRift ? '협곡 · 포지션' : '증바람'})</h3>
          <p className="text-xs text-subtle mt-0.5">
            카드를 끌어 {isRift ? '포지션별로' : '각 팀에'} 배치하세요 · 저장 버튼으로 확정됩니다
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

      <DndContext
        sensors={sensors}
        onDragStart={(e: DragStartEvent) => setActiveCard((e.active.data.current?.card as Card) ?? null)}
        onDragCancel={() => setActiveCard(null)}
        onDragEnd={handleDragEnd}
      >
        {/* 미배치 풀 + 외부인 추가 */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[10px] font-black tracking-widest uppercase text-subtle">미배치 ({poolCards.length})</span>
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
                className="px-2.5 py-1 rounded-lg text-xs font-bold bg-surface-2 border border-line text-fg
                  hover:bg-surface disabled:opacity-40"
              >
                추가
              </button>
            </div>
          </div>
          <Pool cards={poolCards} disabled={saving} />
        </div>

        {/* 2팀 × 5슬롯 */}
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
                  {Array.from({ length: TEAM_SIZE }).map((_, slotIdx) => (
                    <Slot
                      key={slotIdx}
                      id={`t${teamIdx}s${slotIdx}`}
                      label={isRift ? positionLabel(LOL_POSITIONS[slotIdx]) : null}
                      card={slotToCard(draft[teamIdx][slotIdx])}
                      disabled={saving}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <DragOverlay>
          {activeCard ? (
            <div className="rounded-lg border border-brand/50 bg-surface-2 px-2.5 py-2 shadow-lg">
              <CardBody card={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <div className="mt-3 flex items-center gap-1.5">
        {Array.from({ length: LOL_CAPACITY }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${i < filledCount ? 'bg-brand' : 'bg-surface-2'}`}
          />
        ))}
        <span className="text-[10px] text-faint ml-1">{filledCount}/{LOL_CAPACITY}명 배정</span>
      </div>
    </div>
  )
}
