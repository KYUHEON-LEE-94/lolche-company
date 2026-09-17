import { OG_CONTENT_TYPE, OG_SIZE } from '@/lib/og/card'
import { renderLolTop3Card } from '@/lib/og/presets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export const alt = '롤체 컴퍼니 롤 랭킹'

export default function Image() {
  return renderLolTop3Card()
}
