// app/profile/page.tsx
import { redirect } from 'next/navigation'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import type { MemberStatus } from '@/types/supabase'
import { listRiotAccounts, pickPrimaryAccount } from '@/lib/members/primaryAccount'
import { withAvatarColumn } from '@/lib/members/avatar'
import MemberSelfForm, { type RiotAccountView } from './MemberSelfForm'
import { CARD, CONTAINER, SHELL } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import ProfileChecklist from '@/app/components/ProfileChecklist'
import ProfileCustomization from './ProfileCustomization'

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

type ProfileMemberRow = {
    id: string
    member_name: string
    riot_game_name: string
    riot_tagline: string
    status: MemberStatus
    rejected_reason: string | null
    user_id: string | null
    profile_image_path: string | null
    profile_frame_path: string | null
    profile_updated_at: string | null
    /** 마이그레이션(20260729) 미적용 환경에서는 undefined 로 들어온다. */
    discord_avatar_url?: string | null
}

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
    const { data: byUserId, error: memberError } = await withAvatarColumn((cols) =>
        supabaseService
            .schema('public')
            .from('members')
            .select(`${SELECT_COLUMNS}${cols}`)
            .eq('user_id', user.id)
            .maybeSingle(),
    )

    if (memberError) {
        throw new Error(memberError.message ?? '프로필을 불러오지 못했습니다.')
    }

    let member = byUserId as ProfileMemberRow | null

    // 관리자가 discord_id만 사전 등록한 경우를 위한 fallback
    if (!member) {
        const discordId = getDiscordId(user)
        if (discordId) {
            const { data: byDiscordData } = await withAvatarColumn((cols) =>
                supabaseService
                    .schema('public')
                    .from('members')
                    .select(`${SELECT_COLUMNS}${cols}`)
                    .eq('discord_id', discordId)
                    .maybeSingle(),
            )

            const byDiscord = byDiscordData as ProfileMemberRow | null
            if (byDiscord && (!byDiscord.user_id || byDiscord.user_id === user.id)) {
                member = byDiscord
            }
        }
    }

    const status: MemberStatus | null = member?.status ?? null

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
                    description="공개 프로필과 칭호, 꾸미기 아이템을 한곳에서 관리하세요."
                    className="mb-6"
                />

                <div className="grid gap-6">
                    {member && status === 'approved' ? (
                        <>
                          <ProfileCustomization
                            member={{
                                id: member.id,
                                member_name: member.member_name,
                                riot_id: `${member.riot_game_name}#${member.riot_tagline}`,
                                discord_avatar_url: member.discord_avatar_url ?? null,
                                profile_frame_path: member.profile_frame_path,
                                profile_updated_at: member.profile_updated_at,
                            }}
                          />
                          <details className={`${CARD} overflow-hidden`}>
                            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-extrabold text-fg marker:hidden sm:px-6">
                              <span>계정 정보 · 라이엇 계정</span>
                              <span className="text-xs font-bold text-muted">열어보기</span>
                            </summary>
                            <div className="border-t border-line p-1 sm:p-2">
                              <MemberSelfForm
                                initial={{
                                  member_name: member.member_name,
                                  riot_game_name: member.riot_game_name,
                                  riot_tagline: member.riot_tagline,
                                }}
                                status={status}
                                rejectedReason={member.rejected_reason}
                                accounts={accounts}
                                migrationRequired={migrationRequired}
                              />
                            </div>
                          </details>
                          <ProfileChecklist />
                        </>
                    ) : (
                        <>
                          <ProfileChecklist />
                          <MemberSelfForm
                            initial={member ? {
                              member_name: member.member_name,
                              riot_game_name: member.riot_game_name,
                              riot_tagline: member.riot_tagline,
                            } : null}
                            status={status}
                            rejectedReason={member?.rejected_reason ?? null}
                            accounts={accounts}
                            migrationRequired={migrationRequired}
                          />
                          <section className={`${CARD} p-6`}>
                              <div className="text-fg font-extrabold">프로필 꾸미기</div>
                              <p className="mt-2 text-sm text-muted">관리자 승인이 완료되면 칭호와 꾸미기 설정이 열려요.</p>
                          </section>
                        </>
                    )}
                </div>
            </div>
        </div>
    )
}
