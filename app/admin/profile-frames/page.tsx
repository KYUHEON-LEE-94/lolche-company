import { redirect } from 'next/navigation'
import AdminFrameManager from './AdminFrameManager'
import { requireAdmin } from '@/app/lib/isAdmin'

export default async function AdminProfileFramesPage() {
    const admin = await requireAdmin()
    if (!admin.ok) redirect('/')

    // 신규 상품 테이블은 authenticated 권한을 revoke했으므로 검증된 service client만 사용한다.
    const [{ data: frames, error: frameError }, { data: effects, error: effectError }] = await Promise.all([
        admin.supabase
            .from('profile_frames')
            .select('id,key,label,image_path,is_active,sort_order,price_points,is_purchasable')
            .order('sort_order', { ascending: true }),
        admin.supabase
            .from('ranking_card_effects')
            .select('id,label,description,effect_key,price_points,is_active,is_purchasable,sort_order')
            .order('sort_order', { ascending: true }),
    ])

    if (frameError || effectError) {
        console.error('[admin/profile-frames] 상품 조회 실패', frameError?.message ?? effectError?.message)
    }

    return (
        <main className="mx-auto max-w-4xl px-4 py-8">
            <AdminFrameManager initialFrames={frames ?? []} initialEffects={effects ?? []} />
        </main>
    )
}
