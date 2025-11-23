'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const navItems = [
  { href: '/admin/members/register', label: '멤버 등록' },
  { href: '/admin/members', label: '멤버 리스트 / 동기화' },
]

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
        {/* 상단 네비게이션 바 */}
        <header className="border-b bg-white/80 backdrop-blur-sm shadow-sm sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                <h1 className="font-bold text-xl bg-gradient-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent">
                  관리자 페이지
                </h1>
              </div>

              <nav className="flex gap-2">
                {navItems.map((item) => {
                  const active = pathname.startsWith(item.href)
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

        {/* 내용 영역 */}
        <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            {children}
          </div>
        </main>
      </div>
  )
}