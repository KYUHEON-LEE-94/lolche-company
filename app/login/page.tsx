'use client'

import { Suspense, useEffect, useState } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { sanitizeNextPath } from '@/lib/auth/discord'
import { useRouter, useSearchParams } from 'next/navigation'

function DiscordIcon() {
  return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.21.375-.45.88-.617 1.284a18.32 18.32 0 0 0-5.53 0A12.66 12.66 0 0 0 9.11 3a19.74 19.74 0 0 0-4.435 1.372C1.878 8.55 1.12 12.62 1.5 16.634a19.93 19.93 0 0 0 6.06 3.058c.49-.67.926-1.382 1.3-2.13a12.9 12.9 0 0 1-2.048-.985c.172-.126.34-.257.502-.392 3.95 1.826 8.227 1.826 12.13 0 .164.135.332.266.503.392-.654.386-1.34.716-2.05.986.375.747.81 1.459 1.3 2.129a19.9 19.9 0 0 0 6.063-3.058c.443-4.65-.762-8.683-3.193-12.265ZM8.35 14.19c-1.183 0-2.157-1.085-2.157-2.418 0-1.332.953-2.418 2.157-2.418 1.213 0 2.18 1.096 2.157 2.418 0 1.333-.953 2.418-2.157 2.418Zm7.3 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.332.953-2.418 2.157-2.418 1.213 0 2.18 1.096 2.157 2.418 0 1.333-.944 2.418-2.157 2.418Z" />
      </svg>
  )
}

function LoginInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 콜백 실패 메시지는 URL query에서 직접 파생 (effect setState 불필요)
  const displayError = error ?? searchParams.get('error')

  // 오픈 리다이렉트 방지: 외부 URL이면 '/'로 강등된다.
  const nextPath = sanitizeNextPath(searchParams.get('next'))

  // 이미 로그인 되어있으면 원래 가려던 페이지로 보내기
  useEffect(() => {
    ;(async () => {
      const { data } = await supabaseClient.auth.getSession()
      if (data.session) router.replace(nextPath)
    })()
  }, [router, nextPath])

  const handleDiscordLogin = async () => {
    setLoading(true)
    setError(null)

    try {
      const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      })

      if (oauthError) {
        setError(oauthError.message)
        setLoading(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그인 중 오류 발생')
      setLoading(false)
    }
  }

  return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-black px-4 py-10">
        <div className="max-w-md mx-auto">
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-3xl p-8 shadow-2xl">
            <h1 className="text-2xl font-black text-white mb-2">로그인</h1>
            <p className="text-slate-300 text-sm mb-6">
              랭킹을 보려면 Discord 로그인이 필요합니다.
            </p>

            <div className="space-y-4">
              {displayError && (
                  <div className="text-sm text-red-300 bg-red-950/30 border border-red-900/40 rounded-2xl px-4 py-3">
                    {displayError}
                  </div>
              )}

              <button
                  type="button"
                  onClick={handleDiscordLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl font-bold bg-[#5865F2] text-white hover:bg-[#4752c4] transition disabled:opacity-60"
              >
                <DiscordIcon />
                {loading ? '디스코드로 이동 중...' : '디스코드로 로그인'}
              </button>
            </div>
          </div>
        </div>
      </div>
  )
}

export default function LoginPage() {
  return (
      <Suspense fallback={null}>
        <LoginInner />
      </Suspense>
  )
}
