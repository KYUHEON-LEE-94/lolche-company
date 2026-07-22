'use client'

import { useState } from 'react'
import { supabaseClient } from '@/lib/supabase'

export default function AdminLoginPage() {
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleDiscordLogin = async () => {
        setLoading(true)
        setError(null)

        try {
            const { error: oauthError } = await supabaseClient.auth.signInWithOAuth({
                provider: 'discord',
                options: {
                    redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent('/admin/members/sync')}`,
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
        <main className="max-w-sm mx-auto p-4">
            <h1 className="text-xl font-bold mb-4">관리자 로그인</h1>
            <div className="space-y-3">
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                    type="button"
                    onClick={handleDiscordLogin}
                    disabled={loading}
                    className="w-full rounded bg-[#5865F2] py-2 text-sm font-medium text-white hover:bg-[#4752c4] disabled:opacity-60"
                >
                    {loading ? '디스코드로 이동 중…' : '디스코드로 로그인'}
                </button>
            </div>
        </main>
    )
}
