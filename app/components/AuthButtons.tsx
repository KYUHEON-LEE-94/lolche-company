'use client'

import { useEffect, useState } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function AuthButtons() {
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      const { data } = await supabaseClient.auth.getSession()
      setEmail(data.session?.user?.email ?? null)
    })()

    const { data: sub } = supabaseClient.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user?.email ?? null)
    })

    return () => sub.subscription.unsubscribe()
  }, [])

  const logout = async () => {
    await supabaseClient.auth.signOut()
  }

  return (
      <div className="flex justify-end mb-4">
        <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl px-4 py-3 flex items-center gap-3">
          {email ? (
              <>
                <div className="text-slate-200 text-sm">
                  <span className="text-slate-400">로그인:</span> {email}
                </div>
                <button
                    onClick={() => router.push('/profile')}
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-700/60 text-slate-200 hover:bg-slate-700 transition"
                >
                  프로필 관리
                </button>
                <button
                    onClick={logout}
                    className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black"
                >
                  로그아웃
                </button>
              </>
          ) : (
              <button
                  onClick={() => router.push('/login')}
                  className="px-4 py-2 rounded-xl text-sm font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black"
              >
                로그인
              </button>
          )}
        </div>
      </div>
  )
}
