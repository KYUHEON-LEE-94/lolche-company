// app/profile/page.tsx
import { redirect } from 'next/navigation'
import { createRouteClient } from '@/lib/supabase/route'
import ProfileEditor from './ProfileEditor'

export const dynamic = 'force-dynamic'

function NotRegisteredNotice() {
    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black px-4 py-10">
            <div className="mx-auto w-full max-w-2xl">
                <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-700/50 p-6 shadow-xl">
                    <h1 className="text-xl font-extrabold text-slate-100">프로필 관리</h1>
                    <p className="mt-3 text-sm text-slate-300 leading-relaxed">
                        현재 로그인된 계정은 <span className="font-semibold text-slate-100">멤버로 등록되어 있지 않아서</span>{' '}
                        프로필을 설정할 수 없어요.
                    </p>
                    <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                        단톡방 멤버 등록은 관리자만 가능해요. <span className="font-semibold text-slate-100">관리자에게 문의</span>해주세요.
                    </p>

                    <div className="mt-6 rounded-2xl bg-slate-800/40 ring-1 ring-slate-700/50 p-4">
                        <div className="text-xs text-slate-400">안내</div>
                        <ul className="mt-2 text-sm text-slate-300 list-disc pl-5 space-y-1">
                            <li>관리자가 멤버 등록 후 다시 접속하면 프로필 설정이 가능해요.</li>
                            <li>등록 시 Riot ID(게임이름#태그) 정보가 필요할 수 있어요.</li>
                        </ul>
                    </div>

                    <div className="mt-6 text-xs text-slate-500">
                        (이 화면은 멤버 미등록 상태일 때만 표시됩니다.)
                    </div>
                </div>
            </div>
        </div>
    )
}

export default async function ProfilePage() {
    const supabase = await createRouteClient()

    // 1) 로그인 체크
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        redirect('/login')
    }

    // 2) 내 members row 조회 (user_id로 1:1)
    const { data: member, error: memberError } = await supabase
        .from('members')
        .select(
            `
      id,
      member_name,
      riot_game_name,
      riot_tagline,
      profile_image_path,
      profile_frame_path,
      profile_updated_at
    `
        )
        .eq('user_id', user.id)
        .maybeSingle()

    if (memberError) {
        throw new Error(memberError.message)
    }

    // ✅ 멤버 미등록이면 안내 화면 렌더링 (redirect 안 함)
    if (!member) {
        return <NotRegisteredNotice />
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black px-4 py-10">
            <div className="mx-auto w-full max-w-4xl">
                <div className="mb-8">
                    <h1 className="text-2xl font-extrabold text-slate-100">프로필 관리</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        프로필 이미지는 선택 사항이며, 프레임/이미지는 각각 없어도 괜찮아요.
                    </p>
                </div>

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
            </div>
        </div>
    )
}
