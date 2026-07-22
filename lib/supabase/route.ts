// lib/supabase/route.ts
import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getDiscordId } from '@/lib/auth/discord'

export async function createRouteClient () {
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
  const supabase = await createRouteClient ()
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    console.error('auth.getUser error', error)
    return null
  }
  return data.user
}

export async function getCurrentAdmin() {
  const supabase = await createRouteClient ()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const columns = 'user_id, discord_id, display_name, is_super_admin, created_at'

  const { data, error } = await supabase
  .from('admins')
  .select(columns)
  .eq('user_id', user.id)
  .maybeSingle()

  if (error) {
    console.error('admins query error', error)
    return null
  }
  if (data) return data

  // user_id 미연결(첫 Discord 로그인 등) 대비 fallback
  const discordId = getDiscordId(user)
  if (!discordId) return null

  const { data: byDiscord, error: discordError } = await supabase
  .from('admins')
  .select(columns)
  .eq('discord_id', discordId)
  .maybeSingle()

  if (discordError) {
    console.error('admins discord_id query error', discordError)
    return null
  }
  return byDiscord // 없으면 null, 있으면 { user_id, display_name, ... }
}


