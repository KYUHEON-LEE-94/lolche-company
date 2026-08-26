'use client'

import { useState } from 'react'
import Image from 'next/image'

type Props = {
  src: string | null
  name: string
  size: number
  className?: string
}

/** 이름 기반 결정적 색상 — 폴백 뱃지가 멤버마다 일관된 색을 갖도록. */
function colorForName(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 42% 42%)`
}

/**
 * Discord 아바타 표시. ★ 대책 컴포넌트:
 * 멤버가 디스코드 프로필을 바꾸면 저장된 URL(옛 해시)이 404가 되는데(재로그인 전까지 stale),
 * 그때 깨진 이미지 아이콘 대신 **이름 이니셜 컬러 뱃지**로 깔끔하게 폴백한다.
 *   - src 없음/로딩 실패(onError) → 컬러 이니셜 뱃지
 *   - next/image 최적화 경로 사용(롤체·롤·명예의 전당이 동일하게 보이도록. unoptimized 아님)
 * 실제 아바타는 본인이 재로그인/방문하면 자동 갱신된다.
 */
export default function SafeAvatarImage({ src, name, size, className = '' }: Props) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span
        aria-hidden
        className={`flex h-full w-full items-center justify-center font-black text-white ${className}`}
        style={{ background: colorForName(name || '?'), fontSize: Math.max(11, Math.round(size * 0.42)) }}
      >
        {(name || '?').slice(0, 1)}
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
