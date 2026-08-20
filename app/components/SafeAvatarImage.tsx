'use client'

import { useState } from 'react'
import Image from 'next/image'

type Props = {
  src: string | null
  name: string
  size: number
  className?: string
}

/** Discord CDN URL이 갱신·삭제되어도 깨진 이미지 아이콘을 노출하지 않는다. */
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
      unoptimized
      onError={() => setFailed(true)}
    />
  )
}
