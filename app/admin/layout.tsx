'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CONTAINER, PANEL } from '@/lib/ui/styles'
import ThemeToggle from '@/app/components/ThemeToggle'

// 상단 메뉴를 카테고리(멤버·로그·시즌·상점)로 묶고, 상세는 드롭다운으로 편다.
// 항목이 1개인 카테고리는 드롭다운 없이 바로 링크로 동작한다.
const navCategories: { label: string; icon: string; items: { href: string; label: string; icon: string }[] }[] = [
    {
        label: '멤버', icon: 'Users',
        items: [
            { href: '/admin/members/control',  label: '멤버 관리',   icon: 'UserPlus' },
            { href: '/admin/members/sync',     label: '멤버 동기화',  icon: 'Users' },
            { href: '/admin/discord-activity', label: '디스코드 활동', icon: 'Activity' },
        ],
    },
    {
        label: '로그', icon: 'Logs',
        items: [
            { href: '/admin/logs',             label: '동기화 로그',  icon: 'Logs' },
        ],
    },
    {
        label: '시즌', icon: 'Trophy',
        items: [
            { href: '/admin/seasons',          label: '시즌 관리',    icon: 'Trophy' },
        ],
    },
    {
        label: '상점', icon: 'Image',
        items: [
            { href: '/admin/profile-frames',   label: '상점 관리',    icon: 'Image' },
            { href: '/admin/points',           label: '포인트 관리',  icon: 'Coins' },
        ],
    },
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
    if (name === 'Coins')
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>
    if (name === 'Logs')
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>
    if (name === 'Activity')
        return <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3 8 4-16 3 8h4"/></svg>
    return null
}

function Chevron({ open }: { open: boolean }) {
    return (
        <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
        </svg>
    )
}

const TRIGGER_BASE = 'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors'
const triggerCls = (active: boolean) => `${TRIGGER_BASE} ${active ? 'bg-brand/15 text-brand-ink' : 'text-muted hover:text-fg hover:bg-surface-2'}`

export default function AdminLayout({ children }: { children: ReactNode }) {
    const pathname = usePathname()
    const [openMenu, setOpenMenu] = useState<string | null>(null)
    const navRef = useRef<HTMLElement>(null)

    const isActive = (href: string) => pathname.startsWith(href)

    // 바깥 클릭 · Esc 로 닫기.
    useEffect(() => {
        if (!openMenu) return
        const onPointerDown = (event: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(event.target as Node)) setOpenMenu(null)
        }
        const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenMenu(null) }
        document.addEventListener('mousedown', onPointerDown)
        document.addEventListener('keydown', onKeyDown)
        return () => {
            document.removeEventListener('mousedown', onPointerDown)
            document.removeEventListener('keydown', onKeyDown)
        }
    }, [openMenu])

    return (
        <div className="min-h-screen flex flex-col bg-canvas">
            {/* ── 헤더 ── */}
            <header className="sticky top-0 z-50 border-b border-line bg-canvas/90 backdrop-blur-md">
                <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-2 sm:gap-3">

                    {/* 로고 영역 — 클릭 시 사이트 홈으로 (어드민에서 나가는 기본 경로) */}
                    <Link
                        href="/"
                        className="flex shrink-0 items-center gap-2 sm:gap-3 rounded-xl px-1 -mx-1 transition-colors hover:bg-surface-2"
                        aria-label="사이트 홈으로 이동"
                    >
                        <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
                        >
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                                <path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        {/* 좁은 화면에서는 텍스트를 숨겨 카테고리 공간을 확보한다. */}
                        <div className="hidden sm:block">
                            <p className="text-sm font-bold text-fg leading-tight">롤체 컴퍼니</p>
                            <p className="text-[10px] font-bold text-brand-ink tracking-widest uppercase leading-tight">Admin</p>
                        </div>
                    </Link>

                    {/* 네비게이션 — 카테고리(멤버/로그/시즌/상점) 단위. 항목 1개면 링크, 여러 개면 드롭다운. */}
                    <nav ref={navRef} className="flex min-w-0 flex-1 items-center gap-0.5 sm:gap-1">
                        {navCategories.map((category) => {
                            const active = category.items.some((item) => isActive(item.href))

                            // 항목 1개 카테고리는 드롭다운 없이 바로 링크.
                            if (category.items.length === 1) {
                                const only = category.items[0]
                                return (
                                    <Link key={category.label} href={only.href} className={triggerCls(active)} aria-current={active ? 'page' : undefined}>
                                        <NavIcon name={category.icon} />
                                        <span>{category.label}</span>
                                    </Link>
                                )
                            }

                            const open = openMenu === category.label
                            return (
                                <div key={category.label} className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setOpenMenu(open ? null : category.label)}
                                        className={triggerCls(active)}
                                        aria-haspopup="menu"
                                        aria-expanded={open}
                                    >
                                        <NavIcon name={category.icon} />
                                        <span>{category.label}</span>
                                        <Chevron open={open} />
                                    </button>

                                    {open && (
                                        <div role="menu" className="absolute left-0 top-full z-50 mt-1.5 min-w-[190px] rounded-xl border border-line bg-canvas p-1.5 shadow-xl shadow-black/10">
                                            {category.items.map((item) => {
                                                const itemActive = isActive(item.href)
                                                return (
                                                    <Link
                                                        key={item.href}
                                                        href={item.href}
                                                        role="menuitem"
                                                        onClick={() => setOpenMenu(null)}
                                                        className={[
                                                            'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-bold transition-colors',
                                                            itemActive ? 'bg-brand/15 text-brand-ink' : 'text-muted hover:text-fg hover:bg-surface-2',
                                                        ].join(' ')}
                                                        aria-current={itemActive ? 'page' : undefined}
                                                    >
                                                        <NavIcon name={item.icon} />
                                                        {item.label}
                                                    </Link>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {/* 사이트 홈으로 가는 경로는 좌측 로고가 담당하므로 별도 "사이트로" 링크는 제거(기능 중복) */}
                        <ThemeToggle className="ml-auto shrink-0" />
                    </nav>
                </div>
            </header>

            {/* ── 메인 ── */}
            <main className={`relative z-10 flex-1 w-full px-4 py-8 ${CONTAINER}`}>
                <div className={PANEL}>{children}</div>
            </main>

            {/* ── 푸터 ── */}
            <footer className="relative z-10 py-5 text-center">
                <p className="text-xs font-medium text-faint">
                    © 2025 롤체 컴퍼니 · Powered by Riot Games API
                </p>
            </footer>
        </div>
    )
}
