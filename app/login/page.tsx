'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

export default function LoginPage() {
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [loading, setLoading] = useState(false)

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
        })
        setLoading(false)

        if (error) {
            setError(error.message)
            return
        }

        // 로그인 성공 → /admin으로 이동
        window.location.href = '/admin/members'
    }

    return (
        <main className="max-w-sm mx-auto p-4">
            <h1 className="text-xl font-bold mb-4">관리자 로그인</h1>
            <form onSubmit={handleLogin} className="space-y-3">
                <input
                    type="email"
                    placeholder="이메일"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="비밀번호"
                    className="w-full rounded border px-3 py-2 text-sm"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                    {loading ? '로그인 중…' : '로그인'}
                </button>
            </form>
        </main>
    )
}