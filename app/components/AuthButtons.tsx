'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'
import { getDiscordAvatarUrl, getDiscordDisplayName, getDiscordId } from '@/lib/auth/discord'
import type { User } from '@supabase/supabase-js'
import { BTN_NEUTRAL } from '@/lib/ui/styles'

export default function AuthButtons() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  // Discord 계정은 email이 없을 수 있으므로 로그인 여부는 user 존재로 판별한다.
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)

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
      setAvatarUrl(getDiscordAvatarUrl(user))

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

  // 바깥 클릭·ESC로 메뉴를 닫는다.
  useEffect(() => {
    if (!menuOpen) return

    function onPointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  const handleLogout = async () => {
    setMenuOpen(false)
    setLoading(true)
    await supabaseClient.auth.signOut()
    setLoading(false)
    router.refresh()
  }

  const go = (path: string) => {
    setMenuOpen(false)
    router.push(path)
  }

  if (loading) {
    return <div className="text-xs text-slate-500">로딩...</div>
  }

  // 비로그인: 로그인 버튼만
  if (!isLoggedIn) {
    return (
        <button onClick={() => router.push('/login')} className={BTN_NEUTRAL}>
          로그인
        </button>
    )
  }

  // 이니셜 폴백(아바타 없을 때)
  const initial = (displayName ?? '?').trim().charAt(0).toUpperCase() || '?'

  // 로그인: 프로필 이미지 버튼 → 드롭다운(프로필/관리/로그아웃)
  return (
      <div className="relative" ref={menuRef}>
        <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="내 메뉴 열기"
            className="flex items-center rounded-full ring-1 ring-line hover:ring-line-strong transition focus:outline-none focus:ring-2 focus:ring-brand/60"
        >
          {avatarUrl ? (
              <Image
                  src={avatarUrl}
                  alt=""
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
              />
          ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/20 text-sm font-black text-indigo-200">
                {initial}
              </span>
          )}
        </button>

        {menuOpen && (
            <div
                role="menu"
                className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-line bg-[#0d1117]/95 backdrop-blur-sm shadow-2xl z-50"
            >
              {displayName && (
                  <div className="px-4 py-3 border-b border-line">
                    <p className="text-xs font-semibold text-slate-400">로그인 계정</p>
                    <p className="mt-0.5 text-sm font-bold text-white truncate">{displayName}</p>
                  </div>
              )}

              <button
                  type="button"
                  role="menuitem"
                  onClick={() => go('/profile')}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-slate-200 hover:bg-surface-2 transition-colors"
              >
                프로필
              </button>

              {isAdmin && (
                  <button
                      type="button"
                      role="menuitem"
                      onClick={() => go('/admin/members/sync')}
                      className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-indigo-300 hover:bg-surface-2 transition-colors"
                  >
                    관리
                  </button>
              )}

              <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="block w-full px-4 py-2.5 text-left text-sm font-semibold text-red-400 hover:bg-surface-2 transition-colors border-t border-line"
              >
                로그아웃
              </button>
            </div>
        )}
      </div>
  )
}
