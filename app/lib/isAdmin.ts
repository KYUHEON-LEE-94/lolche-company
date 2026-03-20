// isAdmin.ts
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { SupabaseClient, User } from '@supabase/supabase-js'
import { Database } from "@/types/supabase";

// ✅ 반환 타입을 명시적으로 정의 (Discriminated Union)
type RequireAdminResponse =
    | { ok: false; user?: null; supabase?: null }
    | { ok: true; user: User; supabase: SupabaseClient<Database> };

export async function requireAdmin(): Promise<RequireAdminResponse> {
    // 1) 유저 인증
    const supabaseAuth = await createRouteClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()

    if (!user) {
        return { ok: false }
    }

    // 2) 관리자 여부 체크
    const { data: admin } = await supabaseService
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!admin) {
        return { ok: false }
    }

    // 3) ✅ 반환 시 명확하게 타입 보장
    return {
        ok: true,
        user,
        supabase: supabaseService as SupabaseClient<Database>,
    }
}