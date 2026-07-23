'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthButtons from '@/app/components/AuthButtons'
import { LOL_ENABLED } from '@/lib/constants/features'

type NavItem = {
  href: string
  label: string
  /** 하위 경로까지 active 로 볼지 여부. '/' 는 정확히 일치할 때만 active */
  exact?: boolean
}

// LoL 은 Riot 제품 권한 승인 전까지 비활성. /lol 자체도 404 를 반환하므로 링크를 노출하지 않는다.
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '대시보드', exact: true },
  { href: '/tft', label: '롤체 랭킹' },
  ...(LOL_ENABLED ? [{ href: '/lol', label: '롤' }] : []),
  { href: '/steam', label: '스팀' },
  { href: '/custom-games', label: '내전' },
  { href: '/hall-of-fame', label: '명예의 전당' },
]

/** SiteNav 를 렌더하지 않는 경로 (자체 레이아웃을 갖거나 nav 가 불필요) */
const HIDDEN_PREFIXES = ['/admin', '/login', '/auth']

export default function SiteNav() {
  const pathname = usePathname()

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null
  }

  return (
    <nav className="border-b border-white/[0.07] bg-[#07090f]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const active = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`)

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                  active
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.06]'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>

        <AuthButtons />
      </div>
    </nav>
  )
}
