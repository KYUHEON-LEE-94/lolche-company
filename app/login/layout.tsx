import type { Metadata } from 'next'

// app/login/page.tsx 는 'use client' 라 metadata 를 export 할 수 없다.
// 이 layout 은 메타데이터만 담당하는 얇은 래퍼이며 로그인 UI 를 변경하지 않는다.
export const metadata: Metadata = {
  title: '롤체 컴퍼니',
  description: '카카오톡 단톡방 전용 TFT 랭킹 · 내전 · 스팀 라운지',
  openGraph: {
    type: 'website',
    siteName: '롤체 컴퍼니',
    locale: 'ko_KR',
    title: '롤체 컴퍼니',
    description: '카카오톡 단톡방 전용 TFT 랭킹 · 내전 · 스팀 라운지',
  },
  twitter: { card: 'summary_large_image' },
}

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
