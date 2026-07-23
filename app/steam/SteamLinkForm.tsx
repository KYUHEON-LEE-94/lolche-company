'use client'

import { FormEvent, useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'

type SteamPayload = {
  steam_id64: string
  steam_persona: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_synced_at?: string | null
  steam_sync_error?: string | null
  is_private: boolean
}

const inputCls =
  'w-full px-4 py-3 rounded-xl text-sm font-medium text-white bg-white/[0.04] border border-white/[0.08] placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/50 focus:bg-emerald-500/5 transition-all'

export default function SteamLinkForm() {
  const router = useRouter()

  const [loaded, setLoaded] = useState(false)
  const [hasMember, setHasMember] = useState(true)
  const [steam, setSteam] = useState<SteamPayload | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/steam')
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '정보를 불러오지 못했습니다.')
      setHasMember(Boolean(body.hasMember))
      setSteam((body.steam as SteamPayload | null) ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/me/steam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ steam_input: input }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '연결에 실패했습니다.')

      setSteam(body.steam as SteamPayload)
      setInput('')
      setMessage(
        body.syncWarning
          ? `${body.message} (동기화 경고: ${body.syncWarning})`
          : (body.message ?? '스팀 계정을 연결했습니다.'),
      )
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleUnlink = async () => {
    setLoading(true)
    setMessage(null)
    setError(null)
    try {
      const res = await fetch('/api/me/steam', { method: 'DELETE' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '해제에 실패했습니다.')
      setSteam(null)
      setMessage(body.message ?? '스팀 연결을 해제했습니다.')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-black text-white">내 스팀 계정</h2>
          <p className="mt-1 text-xs text-slate-400">
            프로필 주소나 SteamID64 를 입력하면 보유 게임과 플레이타임이 집계됩니다.
          </p>
        </div>
      </div>

      {!loaded ? (
        <p className="mt-5 text-xs text-slate-500">불러오는 중...</p>
      ) : !hasMember ? (
        <p className="mt-5 text-xs text-slate-400">
          먼저 프로필에서 멤버 등록을 완료해주세요.
        </p>
      ) : steam ? (
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06]">
              {steam.steam_avatar_url && (
                <Image
                  src={steam.steam_avatar_url}
                  alt=""
                  fill
                  sizes="40px"
                  className="object-cover"
                  unoptimized
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-white">
                {steam.steam_persona ?? '이름 없음'}
              </p>
              <p className="truncate text-[11px] text-slate-500">{steam.steam_id64}</p>
            </div>
            <button
              type="button"
              onClick={handleUnlink}
              disabled={loading}
              className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-[11px] font-bold text-slate-300 transition-colors hover:border-red-500/40 hover:text-red-300 disabled:opacity-50"
            >
              연결 해제
            </button>
          </div>

          {steam.is_private && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs font-bold text-amber-200/90">
              프로필 비공개 — 게임 데이터가 표시되지 않습니다. 스팀 프로필 설정에서 &ldquo;내 프로필&rdquo;과
              &ldquo;게임 상세 정보&rdquo;를 공개로 바꿔주세요.
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className={inputCls}
            placeholder="https://steamcommunity.com/id/myname 또는 76561198000000000"
            required
          />
          <p className="text-[11px] text-slate-600">
            프로필 주소(/id/… 또는 /profiles/…), SteamID64, 사용자 이름 모두 인식합니다.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white transition-all hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? '연결 중...' : '스팀 계정 연결하기'}
          </button>
        </form>
      )}

      {message && (
        <div className="mt-4 rounded-xl bg-emerald-500/10 p-3 text-xs font-bold text-emerald-300 ring-1 ring-emerald-500/20">
          {message}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-xl bg-red-500/10 p-3 text-xs font-bold text-red-300 ring-1 ring-red-500/20">
          {error}
        </div>
      )}
    </section>
  )
}
