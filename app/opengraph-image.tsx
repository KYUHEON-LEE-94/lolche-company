import { OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og/card'
import { renderTftTop3Card } from '@/lib/og/presets'

// 로컬 TTF 로드 + supabase-js 를 쓰므로 edge 금지.
export const runtime = 'nodejs'
export const revalidate = 600
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = '롤체 컴퍼니 롤체 랭킹'

export default function Image() {
  return renderTftTop3Card()
}
