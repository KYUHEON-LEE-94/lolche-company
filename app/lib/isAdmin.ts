import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'

export async function requireAdmin() {
    // 1) 유저 인증은 쿠키 기반 client로
    const supabaseAuth = await createRouteClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()

    if (!user) {
        return { ok: false as const }
    }

    // 2) 관리자 여부 체크 (service role 써도 됨)
    const { data: admin } = await supabaseService
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!admin) {
        return { ok: false as const }
    }

    // 3) ✅ DB 조작은 service role client로
    return {
        ok: true as const,
        user,
        supabase: supabaseService,
    }
}
