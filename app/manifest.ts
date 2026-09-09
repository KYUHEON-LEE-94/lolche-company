import type { MetadataRoute } from 'next'

/**
 * Next 규약 파일 → `/manifest.webmanifest`.
 * iOS 는 홈 화면에 추가한 PWA 안에서만 웹 푸시를 지원하므로(iOS 16.4+) manifest 가 필수다.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: '롤체 컴퍼니',
    short_name: '롤체',
    description: '롤체 컴퍼니 단톡방 멤버 랭킹·내전 서비스',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#07090f',
    theme_color: '#6366f1',
    lang: 'ko',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
