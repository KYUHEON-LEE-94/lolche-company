/**
 * 크롤러 rewrite 전용 메타 페이지 레이아웃.
 *
 * 루트 레이아웃의 SiteNav 등 앱 UI 를 상속하지 않도록 최소 마크업만 둔다.
 * ⚠ 이 트리에서는 세션(cookies()/auth.getUser())을 절대 읽지 않는다 — ISR 공유 캐시다.
 */
export default function OgPreviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '60vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 48,
        textAlign: 'center',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {children}
    </div>
  )
}
