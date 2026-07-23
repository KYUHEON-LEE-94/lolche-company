// app/profile/page.tsx
import { redirect } from 'next/navigation'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import type { MemberStatus } from '@/types/supabase'
import { listRiotAccounts, pickPrimaryAccount } from '@/lib/members/primaryAccount'
import ProfileEditor from './ProfileEditor'
import MemberSelfForm, { type RiotAccountView } from './MemberSelfForm'
import { CARD, CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'

export const dynamic = 'force-dynamic'

const SELECT_COLUMNS = `
  id,
  member_name,
  riot_game_name,
  riot_tagline,
  status,
  rejected_reason,
  user_id,
  profile_image_path,
  profile_frame_path,
  profile_updated_at
`

export default async function ProfilePage() {
    const supabase = await createRouteClient()

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
        redirect('/login')
    }

    // RLS의 self-SELECT 정책 유무와 무관하게 동작하도록 service role로 조회한다.
    const { data: byUserId, error: memberError } = await supabaseService
        .schema('public')
        .from('members')
        .select(SELECT_COLUMNS)
        .eq('user_id', user.id)
        .maybeSingle()

    if (memberError) {
        throw new Error(memberError.message)
    }

    let member = byUserId

    // 관리자가 discord_id만 사전 등록한 경우를 위한 fallback
    if (!member) {
        const discordId = getDiscordId(user)
        if (discordId) {
            const { data: byDiscord } = await supabaseService
                .schema('public')
                .from('members')
                .select(SELECT_COLUMNS)
                .eq('discord_id', discordId)
                .maybeSingle()

            if (byDiscord && (!byDiscord.user_id || byDiscord.user_id === user.id)) {
                member = byDiscord
            }
        }
    }

    const status = (member?.status ?? null) as MemberStatus | null

    // 마이그레이션 미적용(테이블 부재)은 500이 아니라 빈 목록 + 안내로 degrade한다.
    let accounts: RiotAccountView[] = []
    let migrationRequired = false
    if (member) {
        const listed = await listRiotAccounts(member.id)
        if (listed.ok) {
            const primary = pickPrimaryAccount(listed.accounts)
            accounts = [...listed.accounts]
                .sort((a, b) => {
                    if (a.id === primary?.id) return -1
                    if (b.id === primary?.id) return 1
                    return a.account_no - b.account_no
                })
                .map((a) => ({
                    id: a.id,
                    account_no: a.account_no,
                    // "대표 없음"은 관측되지 않는다 — 파생 결과를 그대로 표시한다.
                    is_primary: a.id === primary?.id,
                    riot_game_name: a.riot_game_name,
                    riot_tagline: a.riot_tagline,
                }))
        } else if (listed.missingTable) {
            migrationRequired = true
        } else {
            throw new Error(listed.message)
        }
    }

    return (
        <div className={SHELL}>
            <div className={CONTAINER}>
                <PageHeader
                    kicker="Profile"
                    accent="indigo"
                    title="프로필 관리"
                    description="라이엇 계정을 직접 등록하고, 승인 후 프로필 이미지·프레임을 설정할 수 있어요."
                    className="mb-8"
                />

                <div className="grid gap-6">
                    <MemberSelfForm
                        initial={
                            member
                                ? {
                                      member_name: member.member_name,
                                      riot_game_name: member.riot_game_name,
                                      riot_tagline: member.riot_tagline,
                                  }
                                : null
                        }
                        status={status}
                        rejectedReason={member?.rejected_reason ?? null}
                        accounts={accounts}
                        migrationRequired={migrationRequired}
                    />

                    {member && status === 'approved' ? (
                        <ProfileEditor
                            userId={user.id}
                            member={{
                                id: member.id,
                                member_name: member.member_name,
                                riot_id: `${member.riot_game_name}#${member.riot_tagline}`,
                                profile_image_path: member.profile_image_path,
                                profile_frame_path: member.profile_frame_path,
                                profile_updated_at: member.profile_updated_at,
                            }}
                        />
                    ) : (
                        <section className={`${CARD} p-6`}>
                            <div className="text-slate-100 font-extrabold">프로필 이미지 · 프레임</div>
                            <p className="mt-2 text-sm text-slate-400">
                                관리자 승인이 완료되면 이곳에서 프로필 이미지와 프레임을 설정할 수 있어요.
                            </p>
                        </section>
                    )}
                </div>
            </div>
        </div>
    )
}
