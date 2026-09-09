import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 600

export const metadata: Metadata = {
  title: '롤체 랭킹 · 롤체 컴퍼니',
  description: '롤체 컴퍼니 멤버들의 TFT 솔로 · 더블업 랭킹',
  openGraph: {
    type: 'website',
    siteName: '롤체 컴퍼니',
    locale: 'ko_KR',
    title: '롤체 랭킹 · 롤체 컴퍼니',
    description: '롤체 컴퍼니 멤버들의 TFT 솔로 · 더블업 랭킹',
    url: '/tft',
  },
  twitter: { card: 'summary_large_image' },
}

export default function OgTftPage() {
  return (
    <>
      <h1>롤체 랭킹</h1>
      <p>롤체 컴퍼니 멤버들의 TFT 솔로 · 더블업 랭킹</p>
      <Link href="/login">로그인하고 보기</Link>
    </>
  )
}
