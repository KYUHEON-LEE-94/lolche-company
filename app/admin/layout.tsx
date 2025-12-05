// app/admin/layout.tsx
import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentAdmin } from '@/app/lib/supabase/server'
import AdminLayoutShell from './AdminLayoutShell'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await getCurrentAdmin()

  if (!admin) {
    // 로그인 안 했거나 admins에 없는 경우
    redirect('/login') // 너의 로그인 페이지 경로로 수정
  }

  // 여기서는 인증만 하고, 실제 UI는 클라이언트 컴포넌트로 넘김
  return <AdminLayoutShell>{children}</AdminLayoutShell>
}
