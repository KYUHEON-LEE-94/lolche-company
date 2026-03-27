'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const navItems = [
    { href: '/admin/members/register', label: '멤버 등록',          icon: 'UserPlus' },
    { href: '/admin/members',          label: '멤버 리스트',         icon: 'Users' },
    { href: '/admin/seasons',          label: '시즌 관리',           icon: 'Trophy' },
    { href: '/admin/profile-frames',   label: '프레임 관리',         icon: 'Image' },
]

function NavIcon({ name }: { name: string }) {
    if (name === 'UserPlus')
        return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                <path d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
        )
    if (name === 'Users')
        return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
        )
    if (name === 'Trophy')
        return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                <path d="M8 21h8m-4-4v4M5 3H3a2 2 0 00-2 2v3c0 2.8 2 5 4.5 5.5M19 3h2a2 2 0 012 2v3c0 2.8-2 5-4.5 5.5M5 3h14v5a7 7 0 01-14 0V3z" />
            </svg>
        )
    if (name === 'Image')
        return (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" />
            </svg>
        )
    return null
}

export default function AdminLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname()

    const isActive = (href: string) => {
        if (href === '/admin/members/register') return pathname === '/admin/members/register'
        if (href === '/admin/members')
            return pathname === '/admin/members' ||
                (pathname.startsWith('/admin/members/') && !pathname.startsWith('/admin/members/register'))
        return pathname.startsWith(href)
    }

    return (
        <div
            className="min-h-screen flex flex-col"
            style={{ background: '#07090f' }}
        >
            {/* 상단 글로우 배경 */}
            <div
                className="pointer-events-none fixed inset-0 z-0"
                style={{
                    background:
                        'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(99,102,241,0.12) 0%, transparent 70%)',
                }}
            />

            {/* ── 헤더 ── */}
            <header
                className="sticky top-0 z-50 border-b"
                style={{
                    background: 'rgba(7,9,15,0.85)',
                    backdropFilter: 'blur(16px)',
                    borderColor: 'rgba(255,255,255,0.07)',
                }}
            >
                <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">

                    {/* 로고 영역 */}
                    <div className="flex items-center gap-3">
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
                        >
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-sm font-bold text-white leading-tight">롤체 컴퍼니</p>
                            <p className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase leading-tight">Admin</p>
                        </div>
                    </div>

                    {/* 네비게이션 */}
                    <nav className="flex gap-1">
                        {navItems.map((item) => {
                            const active = isActive(item.href)
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={[
                                        'relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-200',
                                        active
                                            ? 'text-white'
                                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5',
                                    ].join(' ')}
                                    style={
                                        active
                                            ? {
                                                background: 'linear-gradient(135deg,rgba(99,102,241,0.25),rgba(79,70,229,0.15))',
                                                border: '1px solid rgba(99,102,241,0.3)',
                                            }
                                            : {}
                                    }
                                >
                                    {/* 활성 인디케이터 */}
                                    {active && (
                                        <span
                                            className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full"
                                            style={{ background: '#818cf8' }}
                                        />
                                    )}
                                    <NavIcon name={item.icon} />
                                    {item.label}
                                </Link>
                            )
                        })}
                    </nav>
                </div>
            </header>

            {/* ── 메인 ── */}
            <main className="relative z-10 flex-1 max-w-6xl mx-auto w-full px-6 py-8">
                <div
                    className="rounded-2xl border p-8"
                    style={{
                        background: 'rgba(13,17,23,0.9)',
                        borderColor: 'rgba(255,255,255,0.07)',
                        backdropFilter: 'blur(8px)',
                    }}
                >
                    {children}
                </div>
            </main>

            {/* ── 푸터 ── */}
            <footer className="relative z-10 py-5 text-center">
                <p className="text-xs font-medium" style={{ color: '#334155' }}>
                    © 2025 롤체 컴퍼니 · Powered by Riot Games API
                </p>
            </footer>
        </div>
    )
}