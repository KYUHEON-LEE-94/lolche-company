import { createRouteClient } from '@/lib/supabase/route'

export async function requireAdmin() {
    const supabase = await createRouteClient()

    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) return { ok: false, supabase, user: null as any }

    const { data: admin } = await supabase
        .from('admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

    if (!admin) return { ok: false, supabase, user }
    return { ok: true, supabase, user }
}