'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AuthButtons from '@/app/components/AuthButtons'
import { LOL_ENABLED } from '@/lib/constants/features'

type IconKey = 'home' | 'tft' | 'lol' | 'steam' | 'custom' | 'trophy'

type NavItem = {
  href: string
  label: string
  /** 하단 탭바용 축약 라벨 (모바일 폭 기준) */
  tabLabel?: string
  /** 하위 경로까지 active 로 볼지 여부. '/' 는 정확히 일치할 때만 active */
  exact?: boolean
  icon: IconKey
  /** 상단 바에서 label 대신 아이콘만 렌더한다 */
  iconOnlyOnTop?: boolean
  /** 모바일 하단 탭바에 노출할지 여부. 4개를 넘기면 터치 타깃이 44px 밑으로 내려간다 */
  inTabBar: boolean
}

// LoL 은 Riot 제품 권한 승인 전까지 비활성. /lol 자체도 404 를 반환하므로 링크를 노출하지 않는다.
// 상단/하단 네비가 이 배열 하나를 공유한다.
const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '홈', exact: true, icon: 'home', iconOnlyOnTop: true, inTabBar: true },
  { href: '/tft', label: '롤체 랭킹', tabLabel: '롤체', icon: 'tft', inTabBar: true },
  ...(LOL_ENABLED
    ? [{ href: '/lol', label: '롤', icon: 'lol' as IconKey, inTabBar: false }]
    : []),
  { href: '/custom-games', label: '내전', icon: 'custom', inTabBar: true },
  { href: '/steam', label: '스팀', icon: 'steam', inTabBar: true },
  { href: '/hall-of-fame', label: '명예의 전당', icon: 'trophy', inTabBar: false },
]

const TAB_ITEMS = NAV_ITEMS.filter((item) => item.inTabBar)

/** SiteNav 를 렌더하지 않는 경로 (자체 레이아웃을 갖거나 nav 가 불필요) */
const HIDDEN_PREFIXES = ['/admin', '/login', '/auth']

/** 인라인 SVG 아이콘. next/image 규칙은 래스터 이미지 대상이며,
 *  active/inactive 색을 currentColor 로 상속받아야 하므로 인라인 SVG 를 쓴다. */
const ICON_PATHS: Record<IconKey, React.ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.8V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.8" />
    </>
  ),
  tft: (
    <>
      <circle cx="12" cy="6.5" r="2.8" />
      <path d="M9.2 10.5c.4 2-.7 3.2-1.2 5h8c-.5-1.8-1.6-3-1.2-5" />
      <path d="M6.5 21h11l-1-3.5h-9z" />
    </>
  ),
  lol: (
    <>
      <path d="M4 3.5 10.5 10 8 12.5 3.5 8V3.5z" />
      <path d="M20 3.5 13.5 10l2.5 2.5L20.5 8V3.5z" />
      <path d="m10.5 13.5 3 3-4 4-3-3z" />
      <path d="m13.5 13.5-3 3 4 4 3-3z" />
    </>
  ),
  custom: (
    <>
      <path d="M4 4h3l9.5 9.5" />
      <path d="M20 4h-3L7.5 13.5" />
      <path d="m14.5 15.5 4 4" />
      <path d="m9.5 15.5-4 4" />
    </>
  ),
  steam: (
    <>
      <rect x="2.5" y="8" width="19" height="10" rx="4.5" />
      <path d="M7 11v4M5 13h4" />
      <circle cx="15.8" cy="12.4" r="1" />
      <circle cx="18.2" cy="14.6" r="1" />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M12 14v3M8.5 20h7l-.5-3h-6z" />
    </>
  ),
}

function NavIcon({ name, className }: { name: IconKey; className: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  )
}

function isActive(pathname: string, item: NavItem) {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`)
}

export default function SiteNav() {
  const pathname = usePathname()

  if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null
  }

  return (
    <>
      <nav className="border-b border-line bg-canvas/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* 모바일: 링크 행 대신 로고만. 6항목 가로 스크롤이 375px 가로 스크롤의 원인이었다. */}
          <Link
            href="/"
            className="md:hidden shrink-0 text-sm font-black tracking-tight text-white"
          >
            롤토 컴퍼니
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item)

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  aria-label={item.iconOnlyOnTop ? item.label : undefined}
                  title={item.iconOnlyOnTop ? item.label : undefined}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-bold transition-colors ${
                    item.iconOnlyOnTop ? 'h-9 w-9 shrink-0' : 'px-3 py-2'
                  } ${
                    active
                      ? 'bg-brand/15 text-indigo-300'
                      : 'text-slate-400 hover:text-white hover:bg-surface-2'
                  }`}
                >
                  {item.iconOnlyOnTop ? (
                    <NavIcon name={item.icon} className="h-[18px] w-[18px]" />
                  ) : (
                    item.label
                  )}
                </Link>
              )
            })}
          </div>

          <AuthButtons />
        </div>
      </nav>

      {/* 모바일 하단 탭바. safe-area-inset-bottom 만큼 아래 여백을 둬 iOS 홈 인디케이터를 피한다. */}
      <nav
        aria-label="주요 메뉴"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <ul className="grid grid-cols-4">
          {TAB_ITEMS.map((item) => {
            const active = isActive(pathname, item)

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 transition-colors ${
                    active ? 'text-indigo-300' : 'text-slate-500'
                  }`}
                >
                  <NavIcon name={item.icon} className="h-5 w-5" />
                  <span className="text-xs font-bold leading-none">
                    {item.tabLabel ?? item.label}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </>
  )
}
