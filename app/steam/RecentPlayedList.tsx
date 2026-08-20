'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import EmptyState from '@/app/components/ui/EmptyState'

export type RecentPlayer = {
  memberId: string
  memberName: string
  avatarUrl: string | null
  totalText: string
  gamesText: string
}

/**
 * "최근 2주 플레이" 목록. 데이터는 전원 동일(ISR 공유 렌더)이지만,
 * 내 기록은 상단 '내 스팀 계정' 카드에 이미 통합돼 있으므로 목록에서는 나를 숨긴다.
 * ★ 개인화(나 숨기기)는 클라이언트에서만 수행 — 서버 렌더 HTML 은 모두에게 동일해 ISR 캐시가 안전하다.
 */
export default function RecentPlayedList({ players }: { players: RecentPlayer[] }) {
  const [myId, setMyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/me/steam')
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => { if (alive && body?.memberId) setMyId(body.memberId as string) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const visible = players.filter((player) => player.memberId !== myId)

  if (visible.length === 0) {
    return <EmptyState>다른 멤버의 최근 2주 플레이 기록이 없습니다.</EmptyState>
  }

  return (
    <ul className="space-y-2">
      {visible.map((player) => (
        <li key={player.memberId} className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-line bg-surface-2">
            {player.avatarUrl ? (
              <Image src={player.avatarUrl} alt="" fill sizes="40px" className="object-cover" unoptimized />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-sm text-subtle">{player.memberName.slice(0, 1)}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-fg">{player.memberName}</p>
            <p className="truncate text-[11px] text-subtle">{player.gamesText}</p>
          </div>
          <span className="shrink-0 text-sm font-black text-ok-ink">{player.totalText}</span>
        </li>
      ))}
    </ul>
  )
}
