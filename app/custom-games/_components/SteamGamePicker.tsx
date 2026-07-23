'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { steamCapsuleUrl } from '@/lib/customGames/display'
import { INPUT } from '@/lib/ui/styles'

/**
 * 스팀 내전의 게임 선택.
 * - 소스 1 (기본): 승인 멤버들이 실제로 보유한 게임(보유자 수 순). Steam API 호출 0건, DB 조회만.
 * - 소스 2: 스팀 스토어 전체 카탈로그. `/api/steam-catalog/search`(서버 경유 외부 호출).
 * - 폴백: 어느 소스에도 없으면 언제든 직접 입력할 수 있다(appid 없이 이름만 저장).
 */

type Source = 'owned' | 'catalog'

type PickerOption = {
  appid: number
  name: string
  /** catalog 소스는 보유자 수를 알 수 없으므로 null (0 으로 찍으면 "아무도 없음"으로 오독된다) */
  ownerCount: number | null
  isMultiplayer: boolean | null
}

type GameOptionRow = {
  appid: number
  name: string
  owner_count: number
  is_multiplayer: boolean | null
}

type CatalogRow = { appid: number; name: string }

export type SteamGameSelection = { label: string; appId: number | null }

type Props = {
  value: SteamGameSelection
  onChange: (value: SteamGameSelection) => void
  disabled?: boolean
}

// 외부 왕복(수백 ms)은 DB 조회(수 ms)보다 비싸므로 중간 타이핑 호출을 더 적극적으로 줄인다.
const DEBOUNCE_OWNED_MS = 250
const DEBOUNCE_CATALOG_MS = 350
const QUERY_MIN = 2

export default function SteamGamePicker({ value, onChange, disabled }: Props) {
  const [manual, setManual] = useState(false)
  const [source, setSource] = useState<Source>('owned')
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PickerOption[]>([])
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [multiplayerOnly, setMultiplayerOnly] = useState(true)

  const reqIdRef = useRef(0)

  const fetchOwned = useCallback(async (q: string, mpOnly: boolean) => {
    const reqId = reqIdRef.current + 1
    reqIdRef.current = reqId
    setLoading(true)
    setUnavailable(false)
    try {
      const params = new URLSearchParams()
      if (q.trim().length >= QUERY_MIN) params.set('q', q.trim())
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
        setNotice('보유 게임 목록이 아직 준비되지 않았습니다. 스팀 전체 검색이나 직접 입력을 이용해주세요.')
        return
      }
      setNotice(null)
      const rows = (body.options as GameOptionRow[]) ?? []
      setOptions(
        rows.map((row) => ({
          appid: row.appid,
          name: row.name,
          ownerCount: Number(row.owner_count ?? 0),
          isMultiplayer: row.is_multiplayer,
        })),
      )
    } catch {
      if (reqIdRef.current !== reqId) return
      setOptions([])
      setNotice('게임 목록을 불러오지 못했습니다')
    } finally {
      if (reqIdRef.current === reqId) setLoading(false)
    }
  }, [])

  const fetchCatalog = useCallback(async (q: string) => {
    const reqId = reqIdRef.current + 1
    reqIdRef.current = reqId
    setLoading(true)
    try {
      const term = q.trim()
      if (term.length < QUERY_MIN) {
        setOptions([])
        setNotice(null)
        setUnavailable(false)
        return
      }
      const res = await fetch(`/api/steam-catalog/search?q=${encodeURIComponent(term)}`, {
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (reqIdRef.current !== reqId) return
      if (!res.ok) {
        setOptions([])
        setUnavailable(false)
        setNotice(body.error ?? '스팀 스토어 검색에 실패했습니다')
        return
      }
      if (body.unavailable) {
        setOptions([])
        setUnavailable(true)
        setNotice(null)
        return
      }
      setUnavailable(false)
      setNotice(null)
      const rows = (body.items as CatalogRow[]) ?? []
      setOptions(
        rows.map((row) => ({
          appid: row.appid,
          name: row.name,
          ownerCount: null,
          isMultiplayer: null,
        })),
      )
    } catch {
      if (reqIdRef.current !== reqId) return
      setOptions([])
      setUnavailable(true)
      setNotice(null)
    } finally {
      if (reqIdRef.current === reqId) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (manual || value.label) return
    const delay = source === 'owned' ? DEBOUNCE_OWNED_MS : DEBOUNCE_CATALOG_MS
    const timer = setTimeout(() => {
      if (source === 'owned') void fetchOwned(query, multiplayerOnly)
      else void fetchCatalog(query)
    }, delay)
    return () => clearTimeout(timer)
  }, [manual, value.label, source, query, multiplayerOnly, fetchOwned, fetchCatalog])

  // 소스 전환 즉시 옛 목록을 비운다. reqId 를 올려 옛 응답이 새 목록을 덮지 못하게 한다.
  const switchSource = (next: Source) => {
    if (next === source) return
    reqIdRef.current += 1
    setSource(next)
    setOptions([])
    setNotice(null)
    setUnavailable(false)
    setLoading(true)
  }

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
          className={INPUT}
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
          ← 목록에서 고르기
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      {value.label ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-2">
          {value.appId !== null && (
            <div className="relative h-[32px] w-[84px] shrink-0 overflow-hidden rounded-md border border-line bg-surface-2">
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
            className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white disabled:opacity-50"
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
            className={INPUT}
          />

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-line p-0.5">
              {(['owned', 'catalog'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => switchSource(s)}
                  disabled={disabled}
                  aria-pressed={source === s}
                  className={`rounded-[6px] px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${
                    source === s
                      ? 'bg-brand/15 text-indigo-300'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {s === 'owned' ? '멤버 보유' : '스팀 전체'}
                </button>
              ))}
            </div>
            {source === 'owned' && (
              <button
                type="button"
                onClick={() => setMultiplayerOnly((v) => !v)}
                disabled={disabled}
                className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50 ${
                  multiplayerOnly
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-line bg-surface text-slate-400'
                }`}
              >
                멀티플레이만 {multiplayerOnly ? 'ON' : 'OFF'}
              </button>
            )}
            <button
              type="button"
              onClick={() => setManual(true)}
              disabled={disabled}
              className="ml-auto text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
            >
              직접 입력
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-xl border border-line">
            {loading ? (
              <p className="px-3 py-4 text-xs text-slate-500">불러오는 중...</p>
            ) : options.length === 0 ? (
              <div className="space-y-2 px-3 py-4">
                {unavailable ? (
                  <p className="text-xs text-amber-400/80">
                    스팀 스토어에 연결할 수 없습니다. 게임 이름을 직접 입력해주세요.
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">
                    {notice ??
                      (source === 'owned'
                        ? '멤버 보유 게임에 없습니다.'
                        : query.trim().length < QUERY_MIN
                          ? '2자 이상 입력해주세요.'
                          : '검색 결과가 없습니다.')}
                  </p>
                )}
                {source === 'owned' && !notice && query.trim().length >= QUERY_MIN ? (
                  <button
                    type="button"
                    onClick={() => switchSource('catalog')}
                    disabled={disabled}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                    스팀 전체에서 “{query.trim()}” 찾기 →
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setManual(true)}
                    disabled={disabled}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 disabled:opacity-50"
                  >
                    직접 입력 →
                  </button>
                )}
              </div>
            ) : (
              <ul>
                {options.map((opt) => (
                  <li key={opt.appid}>
                    <button
                      type="button"
                      onClick={() => onChange({ label: opt.name.slice(0, 30), appId: opt.appid })}
                      disabled={disabled}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-surface-2 disabled:opacity-50"
                    >
                      <div className="relative h-[28px] w-[74px] shrink-0 overflow-hidden rounded border border-line bg-surface-2">
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
                          {opt.ownerCount !== null && opt.isMultiplayer === null && (
                            <span className="shrink-0 rounded border border-line bg-slate-700/40 px-1 py-0.5 text-[9px] font-bold text-slate-400">
                              분류 미확인
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500">
                          {opt.ownerCount !== null ? `보유 ${opt.ownerCount}명` : '스팀 스토어'}
                        </p>
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
