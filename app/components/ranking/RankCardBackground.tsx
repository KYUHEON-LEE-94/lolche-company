import Image from 'next/image'
import { resolveRankBgUrl } from '@/lib/cosmetics/rankBgUrl'

// 훅이 없는 순수 프리젠테이션 컴포넌트라 server/client 양쪽에서 import 한다.
// 카드 배경 이미지가 있을 때만 렌더하며, 콘텐츠(-z-10) 아래 깔린다.
export default function RankCardBackground({ imagePath }: { imagePath: string | null | undefined }) {
  if (!imagePath) return null
  const url = resolveRankBgUrl(imagePath, (p) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rank-backgrounds/${encodeURIComponent(p).replaceAll('%2F', '/')}`)
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      <Image src={url} alt="" fill sizes="100vw" className="object-cover opacity-90" />
    </div>
  )
}
