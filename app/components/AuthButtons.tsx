'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase' // 너가 쓰는 클라이언트 인스턴스로 맞춰

export default function AuthButtons() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    let mounted = true

    async function load() {
      setLoading(true)
      const { data } = await supabaseClient.auth.getSession()
      const user = data.session?.user ?? null
      if (!mounted) return

      setUserEmail(user?.email ?? null)

      if (user) {
        // ✅ 관리자 체크 (admins 테이블)
        const { data: adminRow } = await supabaseClient
            .from('admins')
            .select('user_id')
            .eq('user_id', user.id)
            .maybeSingle()

        if (!mounted) return
        setIsAdmin(!!adminRow)
      } else {
        setIsAdmin(false)
      }

      setLoading(false)
    }

    load()

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
      // 로그인/로그아웃 시 관리자 여부 재조회
      ;(async () => {
        const u = session?.user
        if (!u) {
          setIsAdmin(false)
          return
        }
        const { data: adminRow } = await supabaseClient
            .from('admins')
            .select('user_id')
            .eq('user_id', u.id)
            .maybeSingle()
        setIsAdmin(!!adminRow)
      })()
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
    return <div className="text-xs text-slate-300/80">로딩...</div>
  }

  // ✅ 비로그인: 로그인 버튼만
  if (!userEmail) {
    return (
        <button
            onClick={() => router.push('/login')}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-700/60 text-slate-200 hover:bg-slate-700 transition"
        >
          로그인
        </button>
    )
  }

  // ✅ 로그인: 프로필 관리 + (관리자면) 관리페이지 + 로그아웃
  return (
      <div className="flex items-center gap-2">
        <button
            onClick={() => router.push('/profile')}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-700/60 text-slate-200 hover:bg-slate-700 transition"
        >
          프로필 관리
        </button>

        {isAdmin && (
            <button
                onClick={() => router.push('/admin/members')}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-blue-600/90 text-white hover:bg-blue-600 transition"
                title="관리자 페이지로 이동"
            >
              관리 페이지
            </button>
        )}

        <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-rose-500/90 text-white hover:bg-rose-500 transition"
        >
          로그아웃
        </button>
      </div>
  )
}
