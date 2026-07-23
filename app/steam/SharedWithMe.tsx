'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'

/**
 * ⚠ 이 섹션은 세션에 의존한다. /steam 페이지는 ISR(revalidate=300) 공유 캐시이므로
 *   서버 컴포넌트에서 세션을 읽으면 A가 만든 HTML이 B에게 서빙된다.
 *   개인화는 반드시 이 클라이언트 컴포넌트 → force-dynamic API 경로로만 흐른다.
 */

type SharedMember = {
  member_id: string
  member_name: string
  steam_avatar_url: string | null
  profile_image_path: string | null
  shared_count: number
  preview_names: string[]
}

type SharedGame = {
  appid: number
  name: string
  is_multiplayer: boolean | null
  my_playtime_forever: number
  their_playtime_forever: number
}

type ViewerState = 'ok' | 'no_member' | 'no_steam' | 'private'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'anonymous' }
  | { kind: 'forbidden'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; state: ViewerState; members: SharedMember[]; migrationRequired: boolean }

function formatHours(minutes: number) {
  const hours = minutes / 60
  if (hours >= 100) return `${Math.round(hours).toLocaleString('ko-KR')}시간`
  if (hours >= 10) return `${hours.toFixed(0)}시간`
  if (hours >= 1) return `${hours.toFixed(1)}시간`
  return `${minutes}분`
}

function getProfileImageUrl(path: string | null) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${path}`
}

function capsuleUrl(appid: number) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/capsule_231x87.jpg`
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-6 py-8 text-center text-sm text-slate-400">
      {children}
    </div>
  )
}

export default function SharedWithMe() {
  const [multiplayerOnly, setMultiplayerOnly] = useState(true)
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [openId, setOpenId] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, SharedGame[] | 'loading' | 'error'>>({})

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    setDetails({})
    setOpenId(null)
    try {
      const res = await fetch(
        `/api/steam/shared-with-me?multiplayer_only=${multiplayerOnly ? '1' : '0'}`,
        { cache: 'no-store' },
      )
      if (res.status === 401) {
        setState({ kind: 'anonymous' })
        return
      }
      const body = await res.json().catch(() => ({}))
      if (res.status === 403) {
        setState({ kind: 'forbidden', message: body.message ?? '승인된 멤버만 이용할 수 있습니다.' })
        return
      }
      if (!res.ok || !body.ok) throw new Error(body.message ?? '목록을 불러오지 못했습니다.')

      setState({
        kind: 'ready',
        state: (body.state as ViewerState) ?? 'ok',
        members: (body.members as SharedMember[]) ?? [],
        migrationRequired: Boolean(body.migration_required),
      })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : '오류가 발생했습니다.' })
    }
  }, [multiplayerOnly])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = async (memberId: string) => {
    if (openId === memberId) {
      setOpenId(null)
      return
    }
    setOpenId(memberId)
    if (details[memberId] && details[memberId] !== 'error') return

    setDetails((prev) => ({ ...prev, [memberId]: 'loading' }))
    try {
      const res = await fetch(
        `/api/steam/shared-with-me/${memberId}?multiplayer_only=${multiplayerOnly ? '1' : '0'}`,
        { cache: 'no-store' },
      )
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '불러오지 못했습니다.')
      setDetails((prev) => ({ ...prev, [memberId]: (body.games as SharedGame[]) ?? [] }))
    } catch {
      setDetails((prev) => ({ ...prev, [memberId]: 'error' }))
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-white">나와 같은 게임을 가진 사람들</h2>
          <p className="mt-1 text-xs text-slate-500">
            내 보유 게임과 겹치는 멤버입니다. 이름을 누르면 겹치는 게임을 모두 볼 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMultiplayerOnly((v) => !v)}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-colors ${
            multiplayerOnly
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
              : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
          }`}
        >
          멀티플레이만 {multiplayerOnly ? 'ON' : 'OFF'}
        </button>
      </div>

      <Body
        state={state}
        openId={openId}
        details={details}
        onToggle={toggle}
      />
    </section>
  )
}

function Body({
  state,
  openId,
  details,
  onToggle,
}: {
  state: LoadState
  openId: string | null
  details: Record<string, SharedGame[] | 'loading' | 'error'>
  onToggle: (memberId: string) => void
}) {
  if (state.kind === 'loading') return <Notice>불러오는 중...</Notice>
  if (state.kind === 'anonymous') {
    return (
      <Notice>
        로그인하면 나와 겹치는 게임을 가진 멤버를 볼 수 있습니다.{' '}
        <Link href="/login" className="font-bold text-emerald-300 hover:underline">
          로그인
        </Link>
      </Notice>
    )
  }
  if (state.kind === 'forbidden') return <Notice>{state.message}</Notice>
  if (state.kind === 'error') return <Notice>{state.message}</Notice>

  if (state.state === 'no_member') {
    return (
      <Notice>
        멤버 등록 후 이용할 수 있습니다.{' '}
        <Link href="/profile" className="font-bold text-emerald-300 hover:underline">
          프로필로 이동
        </Link>
      </Notice>
    )
  }
  if (state.state === 'no_steam') {
    return <Notice>스팀 ID를 먼저 등록해주세요. (위 &ldquo;내 스팀 계정&rdquo; 참고)</Notice>
  }
  if (state.state === 'private') {
    return (
      <Notice>
        스팀 프로필이 비공개라 보유 게임을 불러올 수 없습니다. 프로필 설정에서 &ldquo;게임 상세
        정보&rdquo;를 공개로 바꿔주세요.
      </Notice>
    )
  }
  if (state.migrationRequired) {
    return <Notice>이 기능은 아직 준비 중입니다. 관리자에게 문의해주세요.</Notice>
  }
  if (state.members.length === 0) {
    return <Notice>아직 같은 게임을 가진 멤버가 없습니다.</Notice>
  }

  return (
    <ul className="space-y-2">
      {state.members.map((m) => {
        const detail = details[m.member_id]
        const open = openId === m.member_id
        const imageUrl = m.steam_avatar_url ?? getProfileImageUrl(m.profile_image_path)

        return (
          <li
            key={m.member_id}
            className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03]"
          >
            <button
              type="button"
              onClick={() => onToggle(m.member_id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.06]">
                {imageUrl ? (
                  <Image src={imageUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-sm text-slate-500">
                    {m.member_name.slice(0, 1)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{m.member_name}</p>
                <p className="truncate text-[11px] text-slate-500">
                  {m.preview_names.length > 0 ? m.preview_names.join(' · ') : '겹치는 게임'}
                </p>
              </div>
              <span className="shrink-0 text-sm font-black text-emerald-300">
                {m.shared_count.toLocaleString('ko-KR')}개
              </span>
              <span className={`shrink-0 text-xs text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}>
                ▾
              </span>
            </button>

            {open && (
              <div className="border-t border-white/[0.06] px-4 py-3">
                {detail === 'loading' || detail === undefined ? (
                  <p className="text-xs text-slate-500">불러오는 중...</p>
                ) : detail === 'error' ? (
                  <p className="text-xs text-red-300">목록을 불러오지 못했습니다.</p>
                ) : detail.length === 0 ? (
                  <p className="text-xs text-slate-500">겹치는 게임이 없습니다.</p>
                ) : (
                  <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {detail.map((g) => (
                      <li key={g.appid} className="flex items-center gap-3">
                        <div className="relative h-[32px] w-[84px] shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/[0.06]">
                          <Image
                            src={capsuleUrl(g.appid)}
                            alt=""
                            fill
                            sizes="84px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs font-bold text-slate-200">{g.name}</p>
                            {g.is_multiplayer === null && (
                              <span className="shrink-0 rounded border border-white/10 bg-slate-700/40 px-1 py-0.5 text-[9px] font-bold text-slate-400">
                                분류 미확인
                              </span>
                            )}
                          </div>
                          <p className="truncate text-[10px] text-slate-500">
                            나 {formatHours(g.my_playtime_forever)} · 상대{' '}
                            {formatHours(g.their_playtime_forever)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
