'use client'

import { useId, useMemo, useState } from 'react'
import { Spinner } from '@/app/components/Spinner'
import { LOL_CAPACITY, LOL_POSITIONS } from '@/lib/customGames/constants'
import { positionLabel } from '@/lib/customGames/display'

const TEAM_SIZE = LOL_CAPACITY / 2 // 5
const GUEST_NAME_MAX = 20

export type LolParticipant = { key: string; name: string }

// 슬롯 3-상태: 확정 멤버 | 외부인 라벨(자유 텍스트) | 미배정.
// 멤버는 목록에서 선택(key 보존), 외부인은 직접 타이핑(name 만).
export type LolSlot =
  | { kind: 'member'; key: string; name: string }
  | { kind: 'guest'; name: string }
  | null

// 2팀 × 5슬롯.
// rift 는 슬롯 index i 가 LOL_POSITIONS[i] 포지션과 대응한다. aram 은 index 가 자리 순번일 뿐이다.
export type LolTeamDraft = [LolSlot[], LolSlot[]]

export const EMPTY_LOL_DRAFT: LolTeamDraft = [
  [null, null, null, null, null],
  [null, null, null, null, null],
]

const slotName = (slot: LolSlot): string => (slot ? slot.name : '')

// 팀 색은 기존 TEAM_COLORS 앞 2개(rose/sky)를 재사용한다.
const TEAM_STYLES = [
  { bg: 'bg-rose-500/10 border-rose-500/25', text: 'text-danger-ink', dot: 'bg-rose-500', label: '1팀 (블루)' },
  { bg: 'bg-sky-500/10 border-sky-500/25', text: 'text-sky-400', dot: 'bg-sky-500', label: '2팀 (레드)' },
]

// ── 슬롯 콤보박스: input + 필터 목록(네이티브 datalist 미사용) ──────────────
function SlotCombobox({
  slot,
  suggestions,
  disabled,
  onPickMember,
  onCommitGuest,
  onClear,
}: {
  slot: LolSlot
  suggestions: LolParticipant[]
  disabled: boolean
  onPickMember: (member: LolParticipant) => void
  onCommitGuest: (name: string) => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const listboxId = useId()

  const query = text.trim().toLowerCase()
  const filtered = useMemo(
    () => (query ? suggestions.filter((s) => s.name.toLowerCase().includes(query)) : suggestions),
    [suggestions, query],
  )

  const commit = () => {
    const trimmed = text.trim()
    setOpen(false)
    if (trimmed === '') {
      // 비워둔 상태로 확정하면 슬롯을 비운다(멤버였다면 해제).
      if (slot) onClear()
      return
    }
    // 멤버였고 이름을 그대로 두면 멤버 유지(외부인으로 오변환 방지).
    if (slot?.kind === 'member' && trimmed === slot.name) return
    onCommitGuest(trimmed.slice(0, GUEST_NAME_MAX))
  }

  return (
    <div className="relative flex-1">
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={open ? text : slotName(slot)}
        placeholder="선수 선택 · 외부인 입력"
        disabled={disabled}
        maxLength={GUEST_NAME_MAX}
        onFocus={() => {
          setText(slotName(slot))
          setOpen(true)
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          } else if (e.key === 'Escape') {
            setOpen(false)
            e.currentTarget.blur()
          }
        }}
        className="w-full px-2 py-1.5 rounded-lg text-xs font-medium text-fg
          bg-surface-2 border border-line
          placeholder:text-faint
          focus:outline-none focus:border-brand/50
          disabled:opacity-50 transition-colors"
      />
      {slot && !open && (
        <button
          type="button"
          tabIndex={-1}
          onClick={onClear}
          disabled={disabled}
          aria-label="슬롯 비우기"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center
            rounded text-faint hover:text-fg disabled:opacity-40 transition-colors"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          id={listboxId}
          className="absolute z-20 left-0 right-0 mt-1 max-h-40 overflow-y-auto
            rounded-lg border border-line bg-surface shadow-lg py-1"
        >
          {filtered.map((s) => (
            <li key={s.key} role="option" aria-selected={slot?.kind === 'member' && slot.key === s.key}>
              <button
                type="button"
                // input blur 보다 먼저 처리해 선택이 커밋되도록 mousedown 에서 막는다.
                onMouseDown={(e) => {
                  e.preventDefault()
                  setOpen(false)
                  onPickMember(s)
                }}
                className="w-full text-left px-2.5 py-1.5 text-xs font-medium text-fg
                  hover:bg-surface-2 transition-colors"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function LolTeamAssignPanel({
  participants,
  mode,
  draft,
  onChange,
  onRandom,
  onSave,
  saving,
  validationError,
}: {
  participants: LolParticipant[]
  mode: 'aram' | 'rift'
  draft: LolTeamDraft
  onChange: (next: LolTeamDraft) => void
  onRandom: () => void
  onSave: () => void
  saving: boolean
  validationError: string | null
}) {
  const isRift = mode === 'rift'

  const assignedMemberKeys = useMemo(() => {
    const set = new Set<string>()
    draft.flat().forEach((s) => {
      if (s && s.kind === 'member') set.add(s.key)
    })
    return set
  }, [draft])

  // ★ 채워진 슬롯 수. 외부인은 member key 가 없어 멤버 Set 카운트에 안 잡히므로 이 값으로 센다.
  const filledCount = useMemo(() => draft.flat().filter((s) => s !== null).length, [draft])
  const canRandom = participants.length === LOL_CAPACITY

  const setSlot = (teamIdx: number, slotIdx: number, next: LolSlot) => {
    const nextDraft: LolTeamDraft = [[...draft[0]], [...draft[1]]]
    if (next?.kind === 'member') {
      // 같은 멤버가 다른 슬롯에 있으면 비운다(중복 배정 방지).
      nextDraft.forEach((team, ti) => {
        team.forEach((s, si) => {
          if (s?.kind === 'member' && s.key === next.key && !(ti === teamIdx && si === slotIdx)) {
            nextDraft[ti][si] = null
          }
        })
      })
    } else if (next?.kind === 'guest') {
      const dupKey = next.name.trim().toLowerCase()
      nextDraft.forEach((team, ti) => {
        team.forEach((s, si) => {
          if (
            s?.kind === 'guest' &&
            s.name.trim().toLowerCase() === dupKey &&
            !(ti === teamIdx && si === slotIdx)
          ) {
            nextDraft[ti][si] = null
          }
        })
      })
    }
    nextDraft[teamIdx][slotIdx] = next
    onChange(nextDraft)
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-fg">팀 배정 ({isRift ? '협곡 · 포지션' : '증바람'})</h3>
          <p className="text-xs text-subtle mt-0.5">
            {isRift ? '각 팀 포지션별로 배치하세요' : '각 팀에 5명씩 배치하세요'} · 확정 멤버 선택 또는 외부인 이름 입력
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRandom}
            disabled={saving || !canRandom}
            title={canRandom ? undefined : `확정 ${LOL_CAPACITY}명이어야 랜덤 배정할 수 있습니다`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              text-xs font-bold transition-all duration-150
              bg-sky-500/10 border border-sky-500/25 text-sky-400
              hover:bg-sky-500/20 hover:text-sky-300
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            랜덤 배정
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving || filledCount === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
              text-xs font-bold transition-all duration-150
              bg-brand/20 border border-brand/40 text-brand-ink
              hover:bg-brand/30
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([0, 1] as const).map((teamIdx) => {
          const ts = TEAM_STYLES[teamIdx]
          return (
            <div key={teamIdx} className={`rounded-xl border p-3 ${ts.bg}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-1.5 h-1.5 rounded-full ${ts.dot}`} />
                <span className={`text-[10px] font-black tracking-widest uppercase ${ts.text}`}>
                  {ts.label}
                </span>
              </div>
              {Array.from({ length: TEAM_SIZE }).map((_, slotIdx) => {
                const currentSlot = draft[teamIdx][slotIdx]
                const suggestions = participants.filter(
                  (p) =>
                    !assignedMemberKeys.has(p.key) ||
                    (currentSlot?.kind === 'member' && currentSlot.key === p.key),
                )
                return (
                  <div key={slotIdx} className="flex items-center gap-2 mb-1.5 last:mb-0">
                    {isRift && (
                      <span className="w-10 text-[10px] font-bold text-muted shrink-0">
                        {positionLabel(LOL_POSITIONS[slotIdx])}
                      </span>
                    )}
                    <SlotCombobox
                      slot={currentSlot}
                      suggestions={suggestions}
                      disabled={saving}
                      onPickMember={(m) => setSlot(teamIdx, slotIdx, { kind: 'member', key: m.key, name: m.name })}
                      onCommitGuest={(name) => setSlot(teamIdx, slotIdx, { kind: 'guest', name })}
                      onClear={() => setSlot(teamIdx, slotIdx, null)}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex items-center gap-1.5">
        {Array.from({ length: LOL_CAPACITY }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-1.5 rounded-full transition-colors ${
              i < filledCount ? 'bg-brand' : 'bg-surface-2'
            }`}
          />
        ))}
        <span className="text-[10px] text-faint ml-1">{filledCount}/{LOL_CAPACITY}명 배정</span>
      </div>
    </div>
  )
}
