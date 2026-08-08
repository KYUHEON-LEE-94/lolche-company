import Image from 'next/image'
import { resolveRankBgUrl } from '@/lib/cosmetics/rankBgUrl'

// 훅이 없는 순수 프리젠테이션 컴포넌트라 server/client 양쪽에서 import 한다.
// 카드 배경 이미지가 있을 때만 렌더하며, 콘텐츠(-z-10) 아래 깔린다.
export default function RankCardBackground({
  imagePath,
  scrim = true,
}: {
  imagePath: string | null | undefined
  /**
   * 가독성 스크림. 배경은 사용자가 올린 임의 밝기의 사진이라
   * (밝은 하늘 등) 그 위의 이름·티어 텍스트가 대비를 잃는다.
   *
   * 양끝만 어둡게 하고 가운데는 남긴다 — 텍스트는 좌(순위·이름)와 우(티어·LP)에 몰려 있고,
   * 가운데는 비어 있어 구매한 배경이 가장 잘 보이는 자리다. 전면 스크림은 꾸밈을 죽인다.
   *
   * 자체 스크림을 이미 가진 곳(상세 패널 헤더)은 false 로 꺼서 이중 적용을 막는다.
   */
  scrim?: boolean
}) {
  if (!imagePath) return null
  const url = resolveRankBgUrl(imagePath, (p) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rank-backgrounds/${encodeURIComponent(p).replaceAll('%2F', '/')}`)
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
      {/* unoptimized: Next 이미지 최적화는 GIF 를 정지 프레임으로 만든다. 움짤 배경을 위해 원본 그대로 서빙한다. */}
      <Image src={url} alt="" fill sizes="100vw" className="object-cover opacity-90" unoptimized />
      {/* 색 정지점을 텍스트 위치에 맞춘다: 좌 0~28%(순위·아바타·이름·라이엇ID),
          우 74~100%(티어·LP·동기화). 그 사이 30% 구간은 배경이 가장 잘 보이는 자리로 남긴다.
          정지점 유틸은 고정 문자열이라 Tailwind purge 에 안전하다(동적 임의값 금지 규칙). */}
      {scrim && (
        <div className="absolute inset-0 bg-gradient-to-r from-panel/88 from-28% via-panel/30 via-50% to-panel/88 to-74%" />
      )}
    </div>
  )
}
