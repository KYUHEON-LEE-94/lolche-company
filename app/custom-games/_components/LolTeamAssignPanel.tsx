'use client'

import { useMemo } from 'react'
import { Spinner } from '@/app/components/Spinner'
import { LOL_CAPACITY, LOL_POSITIONS } from '@/lib/customGames/constants'
import { positionLabel } from '@/lib/customGames/display'

const TEAM_SIZE = LOL_CAPACITY / 2 // 5

export type LolParticipant = { key: string; name: string }

// 2팀 × 5슬롯. 각 슬롯 = member key | null.
// rift 는 슬롯 index i 가 LOL_POSITIONS[i] 포지션과 대응한다. aram 은 index 가 자리 순번일 뿐이다.
export type LolTeamDraft = [(string | null)[], (string | null)[]]

export const EMPTY_LOL_DRAFT: LolTeamDraft = [
  [null, null, null, null, null],
  [null, null, null, null, null],
]

// 팀 색은 기존 TEAM_COLORS 앞 2개(rose/sky)를 재사용한다.
const TEAM_STYLES = [
  { bg: 'bg-rose-500/10 border-rose-500/25', text: 'text-danger-ink', dot: 'bg-rose-500', label: '1팀 (블루)' },
  { bg: 'bg-sky-500/10 border-sky-500/25', text: 'text-sky-400', dot: 'bg-sky-500', label: '2팀 (레드)' },
]

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
  const assignedKeys = useMemo(
    () => new Set(draft.flat().filter(Boolean) as string[]),
    [draft],
  )
  const canRandom = participants.length === LOL_CAPACITY

  const handleSlotChange = (teamIdx: number, slotIdx: number, newKey: string | null) => {
    const next: LolTeamDraft = [[...draft[0]], [...draft[1]]]
    if (newKey) {
      // 같은 멤버가 다른 슬롯에 있으면 비운다(중복 배정 방지).
      next.forEach((team, ti) => {
        team.forEach((k, si) => {
          if (k === newKey && !(ti === teamIdx && si === slotIdx)) next[ti][si] = null
        })
      })
    }
    next[teamIdx][slotIdx] = newKey
    onChange(next)
  }

  return (
    <div className="rounded-2xl border border-line bg-surface p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-black text-fg">팀 배정 ({isRift ? '협곡 · 포지션' : '증바람'})</h3>
          <p className="text-xs text-subtle mt-0.5">
            {isRift ? '각 팀 포지션별로 배치하세요' : '각 팀에 5명씩 배치하세요'}
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
            disabled={saving || assignedKeys.size === 0}
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
                const currentKey = draft[teamIdx][slotIdx]
                return (
                  <div key={slotIdx} className="flex items-center gap-2 mb-1.5 last:mb-0">
                    {isRift && (
                      <span className="w-10 text-[10px] font-bold text-muted shrink-0">
                        {positionLabel(LOL_POSITIONS[slotIdx])}
                      </span>
                    )}
                    <select
                      value={currentKey ?? ''}
                      onChange={(e) => handleSlotChange(teamIdx, slotIdx, e.target.value || null)}
                      disabled={saving}
                      className="flex-1 px-2 py-1.5 rounded-lg text-xs font-medium text-fg
                        bg-surface-2 border border-line
                        focus:outline-none focus:border-brand/50
                        disabled:opacity-50 transition-colors"
                    >
                      <option value="">선수 선택</option>
                      {participants
                        .filter((p) => p.key === currentKey || !assignedKeys.has(p.key))
                        .map((p) => (
                          <option key={p.key} value={p.key}>{p.name}</option>
                        ))}
                    </select>
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
              i < assignedKeys.size ? 'bg-brand' : 'bg-surface-2'
            }`}
          />
        ))}
        <span className="text-[10px] text-faint ml-1">{assignedKeys.size}/{LOL_CAPACITY}명 배정</span>
      </div>
    </div>
  )
}
