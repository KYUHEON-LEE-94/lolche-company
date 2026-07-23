'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'
import { getDiscordDisplayName, getDiscordId } from '@/lib/auth/discord'
import type { User } from '@supabase/supabase-js'
import { BTN_DANGER, BTN_NEUTRAL, BTN_PRIMARY } from '@/lib/ui/styles'

export default function AuthButtons() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  // Discord 계정은 email이 없을 수 있으므로 로그인 여부는 user 존재로 판별한다.
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    async function checkAdmin(user: User) {
      const { data: byUserId } = await supabaseClient
          .from('admins')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle()

      if (byUserId) return true

      // user_id 백필 전(첫 로그인 직후 등) 대비 fallback
      const discordId = getDiscordId(user)
      if (!discordId) return false

      const { data: byDiscordId } = await supabaseClient
          .from('admins')
          .select('user_id')
          .eq('discord_id', discordId)
          .maybeSingle()

      return !!byDiscordId
    }

    async function applyUser(user: User | null) {
      setIsLoggedIn(!!user)
      setDisplayName(getDiscordDisplayName(user))

      if (!user) {
        setIsAdmin(false)
        return
      }

      const admin = await checkAdmin(user)
      if (!mounted) return
      setIsAdmin(admin)
    }

    async function load() {
      setLoading(true)
      const { data } = await supabaseClient.auth.getSession()
      if (!mounted) return
      await applyUser(data.session?.user ?? null)
      if (!mounted) return
      setLoading(false)
    }

    load()

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      void applyUser(session?.user ?? null)
    })

    return () => {
      mounted = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const handleLogout = async () => {
    setLoading(true)
    await supabaseClient.auth.signOut()
    setLoading(false)
    router.refresh()
  }

  if (loading) {
    return <div className="text-xs text-slate-500">로딩...</div>
  }

  // ✅ 비로그인: 로그인 버튼만
  if (!isLoggedIn) {
    return (
        <button
            onClick={() => router.push('/login')}
            className={BTN_NEUTRAL}
        >
          로그인
        </button>
    )
  }

  // ✅ 로그인: 프로필 관리 + (관리자면) 관리페이지 + 로그아웃
  return (
      <div className="flex items-center gap-2">
        {displayName && (
            <span className="hidden sm:inline text-xs font-semibold text-slate-300 max-w-[10rem] truncate">
              {displayName}
            </span>
        )}

        <button
            onClick={() => router.push('/profile')}
            className={BTN_NEUTRAL}
        >
          프로필 관리
        </button>

        {isAdmin && (
            <button
                onClick={() => router.push('/admin/members/sync')}
                className={BTN_PRIMARY}
                title="관리자 페이지로 이동"
            >
              관리 페이지
            </button>
        )}

        <button
            onClick={handleLogout}
            className={BTN_DANGER}
        >
          로그아웃
        </button>
      </div>
  )
}
