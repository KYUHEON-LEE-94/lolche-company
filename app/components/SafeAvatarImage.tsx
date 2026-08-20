'use client'

import { useState } from 'react'
import Image from 'next/image'

type Props = {
  src: string | null
  name: string
  size: number
  className?: string
}

/**
 * Discord CDN URL이 갱신·삭제되어도 깨진 이미지 아이콘을 노출하지 않는다.
 *
 * ★ next/image 최적화 경로를 쓴다(unoptimized 아님). 롤체 랭킹(TFT)이 이미 최적화 <Image>로
 *   같은 Discord 아바타를 렌더하므로, 롤 페이지도 같은 경로를 써야 두 페이지가 동일하게 보인다.
 *   (unoptimized 직접 로드는 아바타를 바꿔 죽은 URL을 실시간 404로 만나 롤에서만 이니셜로 떨어졌다.)
 *   진짜로 못 불러오면 onError 로 이니셜 폴백 — 깨진 아이콘은 여전히 노출하지 않는다.
 */
export default function SafeAvatarImage({ src, name, size, className = '' }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span className={`flex h-full w-full items-center justify-center text-sm text-subtle ${className}`}>
        {name.slice(0, 1)}
      </span>
    )
  }

  return (
    <Image
      src={src}
      alt=""
      fill
      sizes={`${size}px`}
      className={`object-cover ${className}`}
      onError={() => setFailed(true)}
    />
  )
}
