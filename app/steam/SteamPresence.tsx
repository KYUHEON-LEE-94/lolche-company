'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import SectionHeader from '@/app/components/ui/SectionHeader'
import EmptyState from '@/app/components/ui/EmptyState'

/**
 * ⚠ /steam 페이지는 ISR(revalidate=300) 공유 캐시다. presence 는 실시간이자 세션 인증이
 *   필요하므로 서버 컴포넌트로 만들면 안 된다. 이 클라이언트 컴포넌트 →
 *   /api/steam-presence(force-dynamic) 경로로만 흐른다.
 */

const POLL_MS = 60_000

type PresenceState = 'online' | 'offline' | 'unavailable'

type PresenceMember = {
  member_id: string
  member_name: string
  steam_avatar_url: string | null
  profile_image_path: string | null
  state: PresenceState
  persona_state: number | null
  game_name: string | null
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'hidden' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; members: PresenceMember[] }

/** 0 은 오프라인이라 여기 오지 않는다. */
const PERSONA_LABEL: Record<number, string> = {
  1: '온라인',
  2: '바쁨',
  3: '자리비움',
  4: '취침',
  5: '거래 희망',
  6: '플레이 희망',
}

function getProfileImageUrl(path: string | null) {
  if (!path) return null
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${path}`
}

export default function SteamPresence() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/steam-presence', { cache: 'no-store' })
      // 미로그인/미승인은 안내 없이 섹션 자체를 숨긴다 (공개 페이지의 노이즈를 줄인다).
      if (res.status === 401 || res.status === 403) {
        setState({ kind: 'hidden' })
        return
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '불러오지 못했습니다.')
      setState({ kind: 'ready', members: (body.members as PresenceMember[]) ?? [] })
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : '오류가 발생했습니다.' })
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const stop = () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    const start = () => {
      if (timerRef.current !== null) return
      timerRef.current = setInterval(() => {
        if (!cancelled) void load()
      }, POLL_MS)
    }

    // 백그라운드 탭이 계속 폴링하지 않게 가시성과 연동한다.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') {
      void load()
      start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load])

  if (state.kind === 'hidden') return null
  if (state.kind === 'ready' && state.members.length === 0) return null

  return (
    <section className="mb-12">
      <SectionHeader
        title="지금 스팀 접속 중"
        hint="약 1분마다 갱신됩니다. 스팀 프로필이 공개인 멤버만 표시됩니다."
      />
      <Body state={state} />
    </section>
  )
}

function Body({ state }: { state: LoadState }) {
  if (state.kind === 'loading') return <EmptyState>불러오는 중...</EmptyState>
  if (state.kind === 'error') return <EmptyState>{state.message}</EmptyState>
  if (state.kind === 'hidden') return null

  const online = state.members.filter((m) => m.state === 'online')
  const unavailable = state.members.filter((m) => m.state === 'unavailable')

  return (
    <div className="space-y-3">
      {online.length === 0 ? (
        <EmptyState>지금 스팀에 접속한 멤버가 없습니다.</EmptyState>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {online.map((m) => (
            <li
              key={m.member_id}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3"
            >
              <Avatar member={m} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{m.member_name}</p>
                <p className="truncate text-xs text-slate-500">
                  {m.game_name ?? PERSONA_LABEL[m.persona_state ?? 1] ?? '온라인'}
                </p>
              </div>
              {m.game_name && (
                <span className="shrink-0 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-300">
                  게임 중
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {unavailable.length > 0 && (
        <p className="text-[11px] text-amber-300/80">
          표시 불가 — 스팀 프로필이 비공개라 접속 상태를 알 수 없습니다:{' '}
          {unavailable.map((m) => m.member_name).join(', ')}
        </p>
      )}
    </div>
  )
}

function Avatar({ member }: { member: PresenceMember }) {
  const imageUrl = member.steam_avatar_url ?? getProfileImageUrl(member.profile_image_path)
  return (
    <div className="relative shrink-0">
      <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-line bg-surface-2">
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm text-slate-500">
            {member.member_name.slice(0, 1)}
          </span>
        )}
      </div>
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-surface bg-emerald-400"
      />
    </div>
  )
}
