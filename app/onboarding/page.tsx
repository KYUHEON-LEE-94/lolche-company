// app/onboarding/page.tsx
import { redirect } from 'next/navigation'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import { CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import OnboardingClient from './OnboardingClient'

export const dynamic = 'force-dynamic'

/**
 * 이 사용자가 이미 members 행에 연결돼 있는지 판정한다.
 * GET /api/me/member 와 동일한 규칙: user_id 우선, 없으면 discord_id 로 보조 조회하되
 * 다른 계정이 선점한 행은 계정 탈취 방지를 위해 "내 것"으로 보지 않는다.
 */
async function isRegisteredMember(userId: string, discordId: string | null): Promise<boolean> {
  const { data: byUserId } = await supabaseService
    .schema('public')
    .from('members')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()

  if (byUserId) return true
  if (!discordId) return false

  const { data: byDiscord } = await supabaseService
    .schema('public')
    .from('members')
    .select('id, user_id')
    .eq('discord_id', discordId)
    .maybeSingle()

  return Boolean(byDiscord && (!byDiscord.user_id || byDiscord.user_id === userId))
}

export default async function OnboardingPage() {
  const supabase = await createRouteClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    redirect('/login')
  }

  // 이미 등록된 사용자가 직접 접근하면 온보딩 반복을 막고 대시보드로 돌려보낸다.
  if (await isRegisteredMember(user.id, getDiscordId(user))) {
    redirect('/')
  }

  return (
    <div className={SHELL}>
      <div className={CONTAINER}>
        <PageHeader
          kicker="Welcome"
          accent="indigo"
          title="롤체 컴퍼니에 오신 걸 환영해요"
          description="라이엇 ID와 스팀 계정을 등록하면 랭킹·전적·함께 할 게임을 볼 수 있어요. 둘 다 나중에 해도 괜찮아요."
          className="mb-8"
        />

        <OnboardingClient />
      </div>
    </div>
  )
}
