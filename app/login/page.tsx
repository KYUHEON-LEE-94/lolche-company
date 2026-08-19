'use client'

import { Suspense, useEffect, useState } from 'react'
import { supabaseClient } from '@/lib/supabase'
import { sanitizeNextPath } from '@/lib/auth/discord'
import { GUILD_GATE_ID } from '@/lib/constants/features'
import { useRouter, useSearchParams } from 'next/navigation'
import { ALERT, CARD } from '@/lib/ui/styles'

function DiscordIcon() {
  return (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
        <path d="M20.317 4.369A19.79 19.79 0 0 0 15.885 3c-.21.375-.45.88-.617 1.284a18.32 18.32 0 0 0-5.53 0A12.66 12.66 0 0 0 9.11 3a19.74 19.74 0 0 0-4.435 1.372C1.878 8.55 1.12 12.62 1.5 16.634a19.93 19.93 0 0 0 6.06 3.058c.49-.67.926-1.382 1.3-2.13a12.9 12.9 0 0 1-2.048-.985c.172-.126.34-.257.502-.392 3.95 1.826 8.227 1.826 12.13 0 .164.135.332.266.503.392-.654.386-1.34.716-2.05.986.375.747.81 1.459 1.3 2.129a19.9 19.9 0 0 0 6.063-3.058c.443-4.65-.762-8.683-3.193-12.265ZM8.35 14.19c-1.183 0-2.157-1.085-2.157-2.418 0-1.332.953-2.418 2.157-2.418 1.213 0 2.18 1.096 2.157 2.418 0 1.333-.953 2.418-2.157 2.418Zm7.3 0c-1.183 0-2.157-1.085-2.157-2.418 0-1.332.953-2.418 2.157-2.418 1.213 0 2.18 1.096 2.157 2.418 0 1.333-.944 2.418-2.157 2.418Z" />
      </svg>
  )
}

/** 서비스가 무엇을 제공하는지 로그인 전에 한눈에 보여주는 소개 항목. */
const LOGIN_FEATURES: { title: string; desc: string; path: string }[] = [
  { title: '실시간 랭킹', desc: 'TFT · LoL 티어 추적', path: 'M8 21h8m-4-4v4M5 3H3a2 2 0 00-2 2v3c0 2.8 2 5 4.5 5.5M19 3h2a2 2 0 012 2v3c0 2.8-2 5-4.5 5.5M5 3h14v5a7 7 0 01-14 0V3z' },
  { title: '내전 모집', desc: '대기열 · 팀 배정', path: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
  { title: '스팀 라운지', desc: '함께할 게임 찾기', path: 'M21 12a9 9 0 11-6.219-8.56M9 12l2 2 4-4' },
  { title: '포인트 · 꾸미기', desc: '출석 · 프레임 · 배경', path: 'M5 3l1.5 4L11 8.5 6.5 10 5 14l-1.5-4L-1 8.5 3.5 7 5 3zm12 5l1 2.5L20.5 12 18 13l-1 2.5L16 13l-2.5-1 2.5-1 1-2.5z' },
]

function FeatureIcon({ path }: { path: string }) {
  return (
      <svg className="h-4 w-4 text-brand-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
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
          // 게이트 ON 이면 콜백에서 가입 서버 목록을 읽어야 하므로 guilds 스코프를 요청한다.
          // OFF 면 기존대로 스코프 미지정(기본 identify email).
          ...(GUILD_GATE_ID ? { scopes: 'identify email guilds' } : {}),
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
      <div className="relative min-h-screen overflow-hidden bg-canvas px-4 py-12 sm:py-16 flex items-center justify-center">
        {/* 배경 장식 — 브랜드 컬러 글로우(테마 토큰 기반, 은은하게) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
          <div className="absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        </div>

        <div className="relative w-full max-w-md">
          {/* 브랜드 히어로 */}
          <div className="mb-8 text-center">
            <div
                className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl shadow-xl"
                style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
            >
              <svg className="h-8 w-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 21h8m-4-4v4M5 3H3a2 2 0 00-2 2v3c0 2.8 2 5 4.5 5.5M19 3h2a2 2 0 012 2v3c0 2.8-2 5-4.5 5.5M5 3h14v5a7 7 0 01-14 0V3z" />
              </svg>
            </div>
            <h1 className="text-3xl font-black tracking-tight text-fg">롤체 컴퍼니</h1>
            <p className="mt-2 text-sm text-muted">카카오톡 단톡방 전용 TFT 랭킹 · 내전 · 스팀 라운지</p>
          </div>

          <div className={`${CARD} p-7 sm:p-8`}>
            <h2 className="text-lg font-black text-fg">로그인하고 시작하기</h2>
            <p className="mt-1 text-sm text-muted">Discord 계정 하나면 아래 기능을 모두 이용할 수 있어요.</p>

            {/* 기능 소개 */}
            <ul className="mt-5 grid grid-cols-2 gap-2">
              {LOGIN_FEATURES.map((feature) => (
                  <li key={feature.title} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 p-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand/10">
                      <FeatureIcon path={feature.path} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-black text-fg">{feature.title}</span>
                      <span className="block text-[11px] leading-tight text-muted">{feature.desc}</span>
                    </span>
                  </li>
              ))}
            </ul>

            {displayError && (
                <div className={`${ALERT.error} mt-5`}>
                  {displayError}
                </div>
            )}

            <button
                type="button"
                onClick={handleDiscordLogin}
                disabled={loading}
                className="mt-5 w-full flex items-center justify-center gap-2.5 px-4 py-3.5 rounded-xl font-bold text-white bg-[#5865F2] hover:bg-[#4752c4] shadow-lg shadow-[#5865F2]/25 transition disabled:opacity-60"
            >
              <DiscordIcon />
              {loading ? '디스코드로 이동 중...' : '디스코드로 로그인'}
            </button>

            <p className="mt-3 text-center text-xs text-faint">
              {GUILD_GATE_ID
                ? '롤체 컴퍼니 Discord 서버 멤버만 로그인할 수 있어요.'
                : '로그인하면 자동으로 멤버 프로필이 준비됩니다.'}
            </p>
          </div>

          <p className="mt-6 text-center text-[11px] font-medium text-faint">
            © 2025 롤체 컴퍼니 · Powered by Riot Games API
          </p>
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
