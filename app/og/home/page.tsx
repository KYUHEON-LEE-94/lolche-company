import type { Metadata } from 'next'
import Link from 'next/link'

export const revalidate = 600

export const metadata: Metadata = {
  title: '롤체 컴퍼니',
  description: '카카오톡 단톡방 전용 TFT 랭킹 · 내전 · 스팀 라운지',
  openGraph: {
    type: 'website',
    siteName: '롤체 컴퍼니',
    locale: 'ko_KR',
    title: '롤체 컴퍼니',
    description: '카카오톡 단톡방 전용 TFT 랭킹 · 내전 · 스팀 라운지',
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
}

export default function OgHomePage() {
  return (
    <>
      <h1>롤체 컴퍼니</h1>
      <p>카카오톡 단톡방 전용 TFT 랭킹 · 내전 · 스팀 라운지</p>
      <Link href="/login">로그인하고 보기</Link>
    </>
  )
}
