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
  /** 지정 시 label 대신 아이콘을 렌더한다. label 은 aria-label/title 로만 쓰인다. */
  icon?: 'home'
}

// LoL 은 Riot 제품 권한 승인 전까지 비활성. /lol 자체도 404 를 반환하므로 링크를 노출하지 않는다.
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', exact: true, icon: 'home' },
  { href: '/tft', label: '롤체 랭킹' },
  ...(LOL_ENABLED ? [{ href: '/lol', label: '롤' }] : []),
  { href: '/steam', label: '스팀' },
  { href: '/custom-games', label: '내전' },
  { href: '/hall-of-fame', label: '명예의 전당' },
]

/** SiteNav 를 렌더하지 않는 경로 (자체 레이아웃을 갖거나 nav 가 불필요) */
const HIDDEN_PREFIXES = ['/admin', '/login', '/auth']

/** 인라인 SVG 아이콘. next/image 규칙은 래스터 이미지 대상이며,
 *  active/inactive 색을 currentColor 로 상속받아야 하므로 인라인 SVG 를 쓴다. */
function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px]"
      fill={active ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={active ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
    </svg>
  )
}

export default function SiteNav() {
  const pathname = usePathname()

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null
  }

  return (
    <nav className="border-b border-line bg-canvas/90 backdrop-blur-md">
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
                aria-label={item.icon ? item.label : undefined}
                title={item.icon ? item.label : undefined}
                className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-bold transition-colors ${
                  item.icon ? 'h-9 w-9 shrink-0' : 'px-3 py-2'
                } ${
                  active
                    ? 'bg-brand/15 text-indigo-300'
                    : 'text-slate-400 hover:text-white hover:bg-surface-2'
                }`}
              >
                {item.icon === 'home' ? <HomeIcon active={active} /> : item.label}
              </Link>
            )
          })}
        </div>

        <AuthButtons />
      </div>
    </nav>
  )
}
