// isAdmin.ts
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import { SupabaseClient, User } from '@supabase/supabase-js'
import { Database } from "@/types/supabase";

// ✅ 반환 타입을 명시적으로 정의 (Discriminated Union)
type RequireAdminResponse =
    | { ok: false; user?: null; supabase?: null }
    | { ok: true; user: User; supabase: SupabaseClient<Database> };

/**
 * discord_id로 사전 등록된 관리자 행에 user_id를 연결한다(자체 치유).
 * 이미 다른 user_id가 연결된 행은 덮어쓰지 않는다.
 */
async function matchAdminByDiscord(user: User): Promise<boolean> {
    const discordId = getDiscordId(user)
    if (!discordId) return false

    const { data: admin, error } = await supabaseService.schema('public')
        .from('admins')
        .select('user_id')
        .eq('discord_id', discordId)
        .maybeSingle()

    if (error) {
        console.error('[requireAdmin] admins discord_id 조회 실패', error.message)
        return false
    }
    if (!admin) return false
    if (admin.user_id && admin.user_id !== user.id) {
        console.error('[requireAdmin] discord_id 행에 다른 user_id가 연결되어 있어 거부')
        return false
    }

    if (!admin.user_id) {
        const { error: updateError } = await supabaseService.schema('public')
            .from('admins')
            .update({ user_id: user.id })
            .eq('discord_id', discordId)
            .is('user_id', null)

        if (updateError) {
            console.error('[requireAdmin] admins user_id 백필 실패', updateError.message)
        }
    }

    return true
}

export async function requireAdmin(): Promise<RequireAdminResponse> {
    // 1) 유저 인증
    const supabaseAuth = await createRouteClient()
    const { data: { user } } = await supabaseAuth.auth.getUser()

    if (!user) {
        return { ok: false }
    }

    // 2) 관리자 여부 체크 (user_id 우선, 미스 시 discord_id 매칭)
    const { data: admin } = await supabaseService.schema('public')
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!admin) {
        const matched = await matchAdminByDiscord(user)
        if (!matched) {
            return { ok: false }
        }
    }

    // 3) ✅ 반환 시 명확하게 타입 보장
    return {
        ok: true,
        user,
        supabase: supabaseService as SupabaseClient<Database>,
    }
}
