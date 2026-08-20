'use client'

import { useState } from 'react'

/**
 * 스팀 게임 캡슐 썸네일. header.jpg 조차 없는 앱(미출시·삭제 등)은
 * next/image 가 깨진 이미지 아이콘을 보여준다 → onError 로 이미지를 숨기고
 * 게임 이니셜만 남겨 깔끔한 폴백을 만든다.
 * ⚠ 서버 컴포넌트(/steam ISR)에서 쓰는 클라이언트 아일랜드.
 *   외부 도메인 + 실패 감지가 필요해 next/image 대신 <img> 를 쓴다.
 */
export default function SteamThumb({ appid, name, headerImageUrl }: { appid: number; name: string; headerImageUrl?: string | null }) {
  const [broken, setBroken] = useState(false)
  const src = headerImageUrl || `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`

  if (broken) {
    return (
      <span className="flex h-full w-full items-center justify-center text-sm font-black text-subtle">
        {name.slice(0, 1)}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 도메인 + onError 폴백 필요
    <img
      src={src}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-full w-full object-cover"
    />
  )
}
