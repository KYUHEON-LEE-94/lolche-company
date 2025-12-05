// lib/supabase/server.ts
import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export async function createClient() {
    const cookieStore = await cookies() // ← 여기서 await

    return createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll().map((cookie) => ({
                        name: cookie.name,
                        value: cookie.value,
                    }))
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options)
                    })
                },
            },
        },
    )
}

export async function getCurrentUser() {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.getUser()
    if (error) {
        console.error('auth.getUser error', error)
        return null
    }
    return data.user
}

export async function getCurrentAdmin() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data, error } = await supabase
        .from('admins')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle()

    if (error) {
        console.error('admins query error', error)
        return null
    }
    return data // 없으면 null, 있으면 { user_id, display_name, ... }
}
