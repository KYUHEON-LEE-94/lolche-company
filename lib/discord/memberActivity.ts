import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveAvatarUrl } from '@/lib/members/avatar'
import { fetchDiscordGuildActivityForPeriod } from './activity'
import type { DiscordActivityPeriod } from './activityHelpers'

export type DiscordMemberActivityRow = {
  /** 연결된 members.id (없으면 null = 순수 Discord 유저). */
  memberId: string | null
  displayName: string
  avatarUrl: string | null
  /** members 행과 discord_id 로 연결됐는지. false 면 사이트 미가입 Discord 유저. */
  linked: boolean
  voiceSeconds: number
  voiceJoins: number
  attendanceDays: number
  messages: number
}

export type DiscordMemberActivityResult = {
  status: 'ready' | 'unconfigured' | 'unavailable'
  period: DiscordActivityPeriod
  rows: DiscordMemberActivityRow[]
}

type MemberLite = {
  id: string
  member_name: string
  discord_id: string | null
  discord_avatar_url: string | null
  status: string
}

/**
 * 지정 기간의 Discord 활동을 DB 멤버와 매칭한다. 음성 시간 내림차순 정렬.
 * - `includeUnlinked=true`(관리자): API가 준 모든 유저를 포함하고, 연결된 멤버는 이름·아바타를 붙인다.
 * - `includeUnlinked=false`(공개/대시보드): status='approved' 이며 활동 데이터가 있는 멤버만.
 */
export async function fetchDiscordMemberActivity(
  period: DiscordActivityPeriod,
  { includeUnlinked }: { includeUnlinked: boolean },
): Promise<DiscordMemberActivityResult> {
  const activity = await fetchDiscordGuildActivityForPeriod(period)
  if (activity.status !== 'ready') return { status: activity.status, period: activity.period, rows: [] }

  const { data: memberData } = await supabaseAdmin
    .from('members')
    .select('id,member_name,discord_id,discord_avatar_url,status')
    .not('discord_id', 'is', null)

  const members = (memberData ?? []) as MemberLite[]
  const byDiscordId = new Map<string, MemberLite>()
  for (const member of members) {
    if (member.discord_id) byDiscordId.set(member.discord_id, member)
  }

  const rows: DiscordMemberActivityRow[] = []

  if (includeUnlinked) {
    // 관리자: API가 준 전체 유저를 그대로 보여준다(연결 여부만 표시).
    for (const entry of activity.members) {
      const member = byDiscordId.get(entry.userId)
      rows.push({
        memberId: member?.id ?? null,
        displayName: member?.member_name ?? entry.userName ?? '알 수 없는 유저',
        avatarUrl: member ? resolveAvatarUrl(member) : null,
        linked: Boolean(member),
        voiceSeconds: entry.voiceSeconds,
        voiceJoins: entry.voiceJoins,
        attendanceDays: entry.attendanceDays,
        messages: entry.messages,
      })
    }
  } else {
    // 공개: 승인 멤버 + 활동 데이터가 있는 경우만.
    const byUserId = new Map(activity.members.map((entry) => [entry.userId, entry]))
    for (const member of members) {
      if (member.status !== 'approved' || !member.discord_id) continue
      const entry = byUserId.get(member.discord_id)
      if (!entry) continue
      rows.push({
        memberId: member.id,
        displayName: member.member_name,
        avatarUrl: resolveAvatarUrl(member),
        linked: true,
        voiceSeconds: entry.voiceSeconds,
        voiceJoins: entry.voiceJoins,
        attendanceDays: entry.attendanceDays,
        messages: entry.messages,
      })
    }
  }

  rows.sort((a, b) => b.voiceSeconds - a.voiceSeconds || a.displayName.localeCompare(b.displayName, 'ko'))
  return { status: 'ready', period: activity.period, rows }
}
