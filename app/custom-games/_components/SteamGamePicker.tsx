'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { steamCapsuleUrl } from '@/lib/customGames/display'

/**
 * 스팀 내전의 게임 선택.
 * - 목록: 승인 멤버들이 실제로 보유한 게임(보유자 수 순). Steam API 호출 0건, DB 조회만.
 * - 폴백: 목록에 없으면 언제든 직접 입력할 수 있다(appid 없이 이름만 저장).
 */

type GameOption = {
  appid: number
  name: string
  owner_count: number
  is_multiplayer: boolean | null
}

export type SteamGameSelection = { label: string; appId: number | null }

type Props = {
  value: SteamGameSelection
  onChange: (value: SteamGameSelection) => void
  disabled?: boolean
}

const DEBOUNCE_MS = 250

export default function SteamGamePicker({ value, onChange, disabled }: Props) {
  const [manual, setManual] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<GameOption[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [multiplayerOnly, setMultiplayerOnly] = useState(true)

  const reqIdRef = useRef(0)

  const fetchOptions = useCallback(async (q: string, mpOnly: boolean) => {
    const reqId = reqIdRef.current + 1
    reqIdRef.current = reqId
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim().length >= 2) params.set('q', q.trim())
      if (!mpOnly) params.set('multiplayer_only', '0')
      const res = await fetch(`/api/steam/game-options?${params.toString()}`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (reqIdRef.current !== reqId) return
      if (!res.ok) {
        setOptions([])
        setNotice(body.error ?? '게임 목록을 불러오지 못했습니다')
        return
      }
      if (body.migration_required) {
        setOptions([])
        setNotice('게임 목록 기능이 아직 준비되지 않았습니다. 직접 입력해주세요.')
        setManual(true)
        return
      }
      setNotice(null)
      setOptions((body.options as GameOption[]) ?? [])
    } catch {
      if (reqIdRef.current !== reqId) return
      setOptions([])
      setNotice('게임 목록을 불러오지 못했습니다')
    } finally {
      if (reqIdRef.current === reqId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (manual) return
    const timer = setTimeout(() => {
      void fetchOptions(query, multiplayerOnly)
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [manual, query, multiplayerOnly, fetchOptions])

  if (manual) {
    return (
      <div className="mt-2 space-y-2">
        <input
          type="text"
          value={value.label}
          onChange={(e) => onChange({ label: e.target.value, appId: null })}
          placeholder="게임 이름 (예: 발헤임)"
          maxLength={30}
          disabled={disabled}
          className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white
            bg-white/[0.04] border border-white/[0.08]
            placeholder:text-slate-600
            focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
        />
        {notice && <p className="text-xs text-amber-400/80">{notice}</p>}
        <button
          type="button"
          onClick={() => {
            setManual(false)
            setNotice(null)
          }}
          disabled={disabled}
          className="text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
        >
          ← 보유 게임 목록에서 고르기
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      {value.label ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-2">
          {value.appId !== null && (
            <div className="relative h-[32px] w-[84px] shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.06]">
              <Image
                src={steamCapsuleUrl(value.appId)}
                alt=""
                fill
                sizes="84px"
                className="object-cover"
                unoptimized
              />
            </div>
          )}
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-white">{value.label}</p>
          <button
            type="button"
            onClick={() => onChange({ label: '', appId: null })}
            disabled={disabled}
            className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white disabled:opacity-50"
          >
            변경
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="게임 검색 (2자 이상)"
            disabled={disabled}
            className="w-full px-4 py-2.5 rounded-xl text-sm font-medium text-white
              bg-white/[0.04] border border-white/[0.08]
              placeholder:text-slate-600
              focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMultiplayerOnly((v) => !v)}
              disabled={disabled}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${
                multiplayerOnly
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-white/10 bg-white/[0.03] text-slate-400'
              }`}
            >
              멀티플레이만 {multiplayerOnly ? 'ON' : 'OFF'}
            </button>
            <button
              type="button"
              onClick={() => setManual(true)}
              disabled={disabled}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
            >
              목록에 없어요 → 직접 입력
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-white/[0.07]">
            {loading ? (
              <p className="px-3 py-4 text-xs text-slate-500">불러오는 중...</p>
            ) : options.length === 0 ? (
              <p className="px-3 py-4 text-xs text-slate-500">
                {notice ?? '표시할 게임이 없습니다. 직접 입력해주세요.'}
              </p>
            ) : (
              <ul>
                {options.map((opt) => (
                  <li key={opt.appid}>
                    <button
                      type="button"
                      onClick={() => onChange({ label: opt.name.slice(0, 30), appId: opt.appid })}
                      disabled={disabled}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/[0.05] disabled:opacity-50"
                    >
                      <div className="relative h-[28px] w-[74px] shrink-0 overflow-hidden rounded border border-white/10 bg-white/[0.06]">
                        <Image
                          src={steamCapsuleUrl(opt.appid)}
                          alt=""
                          fill
                          sizes="74px"
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-slate-200">{opt.name}</p>
                          {opt.is_multiplayer === null && (
                            <span className="shrink-0 rounded border border-white/10 bg-slate-700/40 px-1 py-0.5 text-[9px] font-bold text-slate-400">
                              분류 미확인
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">보유 {opt.owner_count}명</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
