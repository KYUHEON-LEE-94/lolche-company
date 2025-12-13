'use client'

import { useEffect, useState } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 이미 로그인 되어있으면 랭킹으로 보내기
  useEffect(() => {
    ;(async () => {
      const { data } = await supabaseClient.auth.getSession()
      if (data.session) router.replace('/') // 랭킹 페이지 경로로 수정 가능
    })()
  }, [router])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    router.replace('/') // 로그인 후 이동할 페이지
  }

  return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black px-4 py-10">
        <div className="max-w-md mx-auto">
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
            <h1 className="text-2xl font-black text-white mb-2">로그인</h1>
            <p className="text-slate-300 text-sm mb-6">이메일/비밀번호로 로그인합니다.</p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-slate-300 text-sm mb-1">이메일</label>
                <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    required
                    className="w-full px-4 py-3 rounded-2xl bg-slate-900/60 border border-slate-700 text-slate-200 outline-none"
                    placeholder="you@example.com"
                />
              </div>

              <div>
                <label className="block text-slate-300 text-sm mb-1">비밀번호</label>
                <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    required
                    className="w-full px-4 py-3 rounded-2xl bg-slate-900/60 border border-slate-700 text-slate-200 outline-none"
                    placeholder="••••••••"
                />
              </div>

              {error && (
                  <div className="text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded-2xl px-4 py-3">
                    {error}
                  </div>
              )}

              <button
                  type="submit"
                  disabled={loading}
                  className="w-full px-4 py-3 rounded-2xl font-bold bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-600 text-black disabled:opacity-60"
              >
                {loading ? '로그인 중...' : '로그인'}
              </button>

              <button
                  type="button"
                  onClick={() => router.replace('/')}
                  className="w-full px-4 py-3 rounded-2xl font-bold bg-slate-700/60 text-slate-200 hover:bg-slate-700 transition"
              >
                랭킹으로 돌아가기
              </button>
            </form>
          </div>
        </div>
      </div>
  )
}
