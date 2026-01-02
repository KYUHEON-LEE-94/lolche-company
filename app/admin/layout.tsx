// app/admin/layout.tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const navItems = [
    { href: '/admin/members/register', label: '멤버 등록' },
    { href: '/admin/members', label: '멤버 리스트 / 동기화' },
    { href: '/admin/profile-frames', label: '프레임 이미지 관리' }, // ✅ 추가
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
        <header className="border-b bg-white/80 backdrop-blur-sm shadow-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="font-bold text-xl">관리자 페이지</h1>

              <nav className="flex gap-2">
                {navItems.map((item) => {
                  // ✅ 정확히 매칭되게: startsWith로 하면 /admin/members 가 register도 잡을 수 있음
                    const active = (() => {
                        // 1️⃣ 멤버 등록은 정확히 일치할 때만
                        if (item.href === '/admin/members/register') {
                            return pathname === '/admin/members/register'
                        }

                        // 2️⃣ 멤버 리스트는 register 제외
                        if (item.href === '/admin/members') {
                            return pathname === '/admin/members'
                                || (pathname.startsWith('/admin/members/') &&
                                    !pathname.startsWith('/admin/members/register'))
                        }

                        // 3️⃣ 기타 메뉴 (프레임 관리 등)
                        return pathname.startsWith(item.href)
                    })()

                  return (
                      <Link
                          key={item.href}
                          href={item.href}
                          className={
                              'px-4 py-2 rounded-lg font-medium text-sm transition-all duration-200 ' +
                              (active
                                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md shadow-blue-200'
                                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900')
                          }
                      >
                        {item.label}
                      </Link>
                  )
                })}
              </nav>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {children}
          </div>
        </main>
      </div>
  )
}
