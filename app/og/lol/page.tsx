import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 600

export const metadata: Metadata = {
  title: '롤 랭킹 · 롤체 컴퍼니',
  description: '롤체 컴퍼니 멤버들의 리그 오브 레전드 솔로랭크',
  openGraph: {
    type: 'website',
    siteName: '롤체 컴퍼니',
    locale: 'ko_KR',
    title: '롤 랭킹 · 롤체 컴퍼니',
    description: '롤체 컴퍼니 멤버들의 리그 오브 레전드 솔로랭크',
    url: '/lol',
  },
  twitter: { card: 'summary_large_image' },
}

export default function OgLolPage() {
  return (
    <>
      <h1>롤 랭킹</h1>
      <p>롤체 컴퍼니 멤버들의 리그 오브 레전드 솔로랭크</p>
      <Link href="/login">로그인하고 보기</Link>
    </>
  )
}
