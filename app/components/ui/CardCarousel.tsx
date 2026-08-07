'use client'

import { useRef, type ReactNode } from 'react'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * 아이템이 perPage 를 넘으면 좌우로 넘기는(스와이프/화살표) 페이지 캐러셀.
 * perPage 이하면 그냥 grid 로 렌더한다. pageClassName 은 각 페이지 내부 레이아웃(예: 'grid grid-cols-3 gap-4').
 */
export default function CardCarousel({
  items,
  perPage,
  pageClassName,
}: {
  items: ReactNode[]
  perPage: number
  pageClassName: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const pages = chunk(items, perPage)

  if (pages.length <= 1) {
    return <div className={pageClassName}>{items}</div>
  }

  const scrollByPage = (dir: number) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((page, i) => (
          <div key={i} className={`w-full shrink-0 snap-start ${pageClassName}`}>
            {page}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => scrollByPage(-1)}
        aria-label="이전"
        className="absolute -left-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel/90 text-lg font-black text-fg shadow-md backdrop-blur transition hover:bg-surface-2"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => scrollByPage(1)}
        aria-label="다음"
        className="absolute -right-3 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel/90 text-lg font-black text-fg shadow-md backdrop-blur transition hover:bg-surface-2"
      >
        ›
      </button>
    </div>
  )
}
