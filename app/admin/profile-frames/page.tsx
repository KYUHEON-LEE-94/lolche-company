import { redirect } from 'next/navigation'
import AdminFrameManager from './AdminFrameManager'
import { createRouteClient } from '@/lib/supabase/route'

export default async function AdminProfileFramesPage() {
    const supabase = await createRouteClient()

    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) redirect('/login')

    // 관리자 체크
    const { data: admin } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!admin) redirect('/') // 또는 403 페이지

    // 프레임 목록은 서버에서 한번 내려줘도 되고, 클라에서 다시 불러도 됨.
    const { data: frames } = await supabase
        .from('profile_frames')
        .select('id,key,label,image_path,is_active,sort_order')
        .order('sort_order', { ascending: true })

    return (
        <main className="mx-auto max-w-4xl px-4 py-8">
            <AdminFrameManager initialFrames={frames ?? []} />
        </main>
    )
}
