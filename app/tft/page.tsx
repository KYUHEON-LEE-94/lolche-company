import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member } from '@/types/supabase'
import MemberRanking from './MemberRanking'
import { TABBAR_SAFE_PB } from '@/lib/ui/styles'
import { getEquippedTitlesByMemberIds } from '@/lib/achievements/publicTitles'
import { fetchDiscordGuildActivity } from '@/lib/discord/activity'
import { resolveAvatarUrl } from '@/lib/members/avatar'
import type { DiscordActivityOverview } from '@/types/discordActivity'
import type { ParsedDiscordActivityMember } from '@/lib/discord/activityHelpers'

export const revalidate = 60

export default async function TftRankingPage() {
  const [{ data, error }, { data: activeSeason }, discordActivity] = await Promise.all([
    supabase
      .from('members')
      .select('id,discord_id,member_name,riot_game_name,riot_tagline,profile_image_path,profile_frame_path,discord_avatar_url,ranking_card_effect_key,ranking_card_bg_image,tft_recent5,tft_tier,tft_rank,tft_league_points,tft_tier_prev,tft_rank_prev,tft_lp_prev,tft_doubleup_tier,tft_doubleup_rank,tft_doubleup_league_points,last_synced_at')
      // 승인 대기/거절 상태의 자가 등록 멤버는 랭킹에 노출하지 않는다.
      .eq('status', 'approved')
      .order('member_name', { ascending: true }),
    supabaseService
      .from('seasons')
      .select('id,season_name,set_number,is_active')
      .eq('is_active', true)
      .maybeSingle(),
    fetchDiscordGuildActivity(),
  ])

  if (error) console.error('Supabase error:', error)
  const members = (data ?? []) as unknown as Member[]
  const titlesByMember = await getEquippedTitlesByMemberIds(members.map((member) => member.id))
  const membersWithTitles = members.map((member) => ({
    ...withoutDiscordId(member),
    equipped_titles: titlesByMember.get(member.id) ?? [],
  }))
  const activityByDiscordId = new Map<string, ParsedDiscordActivityMember>()
  if (discordActivity.status === 'ready') {
    for (const member of discordActivity.members) activityByDiscordId.set(member.userId, member)
  }
  const activityOverview: DiscordActivityOverview = {
    status: discordActivity.status,
    from: discordActivity.period.from,
    to: discordActivity.period.to,
    generatedAt: discordActivity.status === 'ready' ? discordActivity.generatedAt : null,
    members: members.map((member) => {
      const activity = member.discord_id ? activityByDiscordId.get(member.discord_id) : undefined
      return {
        memberId: member.id,
        memberName: member.member_name,
        avatarUrl: resolveAvatarUrl(member),
        hasActivityData: activity !== undefined,
        attendanceDays: activity?.attendanceDays ?? null,
        voiceSeconds: activity?.voiceSeconds ?? null,
        voiceJoins: activity?.voiceJoins ?? null,
        messages: activity?.messages ?? null,
      }
    }),
  }

  return (
    // MemberRanking 은 SHELL 을 쓰지 않고 자체 셸을 가진다. 모바일 하단 탭바 여백만 여기서 보탠다.
    <main className={`mx-auto ${TABBAR_SAFE_PB}`}>
      <MemberRanking
        members={membersWithTitles}
        currentSeason={activeSeason}
        discordActivity={activityOverview}
      />
    </main>
  )
}

function withoutDiscordId(member: Member): Omit<Member, 'discord_id'> {
  const { discord_id: _discordId, ...publicMember } = member
  void _discordId
  return publicMember
}
