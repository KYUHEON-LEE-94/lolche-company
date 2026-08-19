'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import EmptyState from '@/app/components/ui/EmptyState'
import { formatDiscordVoiceDuration } from '@/lib/discord/activityHelpers'
import type { DiscordActivityMember, DiscordActivityOverview } from '@/types/discordActivity'

type SortKey = 'voice' | 'days' | 'messages'

const SORT_LABELS: Record<SortKey, string> = {
  voice: '음성 시간',
  days: '활동일',
  messages: '메시지',
}

function metric(member: DiscordActivityMember, sortKey: SortKey): number {
  if (!member.hasActivityData) return -1
  if (sortKey === 'voice') return member.voiceSeconds ?? 0
  if (sortKey === 'days') return member.attendanceDays ?? 0
  return member.messages ?? 0
}

export default function DiscordActivityPanel({ overview }: { overview: DiscordActivityOverview }) {
  const [sortKey, setSortKey] = useState<SortKey>('voice')
  const measuredMembers = overview.members.filter((member) => member.hasActivityData)
  const totalVoiceSeconds = measuredMembers.reduce((sum, member) => sum + (member.voiceSeconds ?? 0), 0)
  const totalMessages = measuredMembers.reduce((sum, member) => sum + (member.messages ?? 0), 0)
  const activeMembers = measuredMembers.filter((member) =>
    (member.voiceSeconds ?? 0) > 0 || (member.attendanceDays ?? 0) > 0 || (member.messages ?? 0) > 0,
  ).length

  const sortedMembers = useMemo(() => [...overview.members].sort((a, b) => {
    const difference = metric(b, sortKey) - metric(a, sortKey)
    return difference || a.memberName.localeCompare(b.memberName, 'ko')
  }), [overview.members, sortKey])

  if (overview.status !== 'ready') {
    return (
      <EmptyState>
        <span className="block font-bold text-fg">Discord 활동 정보를 불러오지 못했습니다.</span>
        <span className="mt-1 block text-xs">잠시 후 다시 확인해 주세요. TFT 랭킹은 정상적으로 이용할 수 있습니다.</span>
      </EmptyState>
    )
  }

  if (overview.members.length === 0) {
    return <EmptyState>연결된 Discord 활동 데이터가 없습니다.</EmptyState>
  }

  if (measuredMembers.length === 0) {
    return <EmptyState>승인 멤버와 연결된 Discord 활동 데이터가 없습니다.</EmptyState>
  }

  return (
    <section aria-labelledby="discord-activity-heading" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-ink">최근 30일</p>
          <h2 id="discord-activity-heading" className="mt-1 text-xl font-black text-fg">Discord 활동</h2>
          <p className="mt-1 text-xs text-muted">{overview.from} – {overview.to} · 음성 채널과 메시지 활동 기준</p>
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-muted">
          정렬
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="min-h-10 rounded-xl border border-line bg-surface px-3 text-sm font-bold text-fg outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>{SORT_LABELS[key]}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryCard label="총 음성 시간" value={formatDiscordVoiceDuration(totalVoiceSeconds)} />
        <SummaryCard label="활동 멤버" value={`${activeMembers}명`} />
        <SummaryCard label="총 메시지" value={`${totalMessages.toLocaleString('ko-KR')}개`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_18px_52px_-34px_var(--color-shadow)] divide-y divide-line">
        {sortedMembers.map((member, index) => (
          <div key={member.memberId} className="grid min-h-[72px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 sm:grid-cols-[auto_minmax(0,1fr)_130px_100px_100px] sm:px-4">
            <span className="w-6 text-center text-xs font-black tabular-nums text-subtle">{index + 1}</span>
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-line bg-surface-2">
                {member.avatarUrl ? (
                  <Image src={member.avatarUrl} alt="" fill sizes="36px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-xs font-black text-muted">{member.memberName.slice(0, 1)}</span>
                )}
              </div>
              <p className="truncate text-sm font-bold text-fg">{member.memberName}</p>
            </div>
            {member.hasActivityData ? (
              <>
                <p className="text-right text-sm font-black tabular-nums text-brand-ink">{formatDiscordVoiceDuration(member.voiceSeconds ?? 0)}</p>
                <p className="hidden text-right text-xs font-bold tabular-nums text-muted sm:block">{member.attendanceDays ?? 0}/30일</p>
                <p className="hidden text-right text-xs font-bold tabular-nums text-muted sm:block">{(member.messages ?? 0).toLocaleString('ko-KR')}개</p>
                <p className="col-start-2 col-end-4 text-xs text-muted sm:hidden">활동 {member.attendanceDays ?? 0}일 · 메시지 {(member.messages ?? 0).toLocaleString('ko-KR')}개</p>
              </>
            ) : (
              <p className="text-right text-xs font-bold text-faint sm:col-span-3">측정 정보 없음</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-line bg-surface px-3 py-3 sm:px-5 sm:py-4">
      <p className="truncate text-[10px] font-bold text-muted sm:text-xs">{label}</p>
      <p className="mt-1 truncate text-sm font-black tabular-nums text-fg sm:text-xl">{value}</p>
    </div>
  )
}
