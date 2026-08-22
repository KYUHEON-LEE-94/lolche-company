import { supabase } from '@/lib/supabase'
import { supabaseService } from '@/lib/supabase/service'
import type { Member } from '@/types/supabase'
import MemberRanking from './MemberRanking'
import { TABBAR_SAFE_PB } from '@/lib/ui/styles'
import { getEquippedTitlesByMemberIds } from '@/lib/achievements/publicTitles'
import { getCurrentSeasonPatchNotes, getTftPatchNotesLastSyncedAt } from '@/lib/tft/patchNotes'

export const revalidate = 60

export default async function TftRankingPage() {
  const [{ data, error }, { data: activeSeason }] = await Promise.all([
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
  ])

  if (error) console.error('Supabase error:', error)
  const members = (data ?? []) as unknown as Member[]
  const [titlesByMember, patchNotes, patchNotesLastSyncedAt] = await Promise.all([
    getEquippedTitlesByMemberIds(members.map((member) => member.id)),
    getCurrentSeasonPatchNotes(activeSeason?.id ?? null),
    getTftPatchNotesLastSyncedAt(),
  ])
  const membersWithTitles = members.map((member) => ({
    ...withoutDiscordId(member),
    equipped_titles: titlesByMember.get(member.id) ?? [],
  }))

  return (
    // MemberRanking 은 SHELL 을 쓰지 않고 자체 셸을 가진다. 모바일 하단 탭바 여백만 여기서 보탠다.
    <main className={`mx-auto ${TABBAR_SAFE_PB}`}>
      <MemberRanking
        members={membersWithTitles}
        currentSeason={activeSeason}
        patchNotes={patchNotes}
        patchNotesLastSyncedAt={patchNotesLastSyncedAt}
      />
    </main>
  )
}

function withoutDiscordId(member: Member): Omit<Member, 'discord_id'> {
  const { discord_id: _discordId, ...publicMember } = member
  void _discordId
  return publicMember
}
