'use client'

import { useRef, type ReactNode, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from 'react'

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * 아이템이 perPage 를 넘으면 좌우로 넘기는 페이지 캐러셀.
 * - 화살표 버튼 / 트랙패드·터치 스와이프 / 마우스 드래그(끌어서) 모두 지원.
 * - perPage 이하면 그냥 grid 로 렌더.
 * pageClassName 은 각 페이지 내부 레이아웃(예: 'grid grid-cols-3 gap-4').
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
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: false })
  const pages = chunk(items, perPage)

  if (pages.length <= 1) {
    return <div className={pageClassName}>{items}</div>
  }

  const scrollByPage = (dir: number) => {
    const el = ref.current
    if (el) el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' })
  }

  // 마우스 끌어서 넘기기. 터치/트랙패드는 네이티브 스크롤을 그대로 쓴다.
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return
    const el = ref.current
    if (!el) return
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: false }
    el.style.scrollSnapType = 'none'
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || !drag.current.active) return
    const dx = e.clientX - drag.current.startX
    if (Math.abs(dx) > 4) drag.current.moved = true
    el.scrollLeft = drag.current.startScroll - dx
  }
  const endDrag = () => {
    const el = ref.current
    if (!el || !drag.current.active) return
    drag.current.active = false
    // 드래그 거리가 페이지의 25% 이상이면 그 방향으로 한 페이지 넘긴다(스냅만으론 중간에 걸린다).
    const pageW = el.clientWidth || 1
    const startPage = Math.round(drag.current.startScroll / pageW)
    const dx = el.scrollLeft - drag.current.startScroll
    let target = startPage
    if (dx > pageW * 0.25) target = startPage + 1
    else if (dx < -pageW * 0.25) target = startPage - 1
    target = Math.max(0, Math.min(pages.length - 1, target))
    el.style.scrollSnapType = ''
    el.scrollTo({ left: target * pageW, behavior: 'smooth' })
  }
  // 드래그로 움직였으면 뒤이어 발생하는 아이템 클릭(구매/장착 등)을 취소한다.
  const onClickCapture = (e: ReactMouseEvent) => {
    if (drag.current.moved) {
      e.preventDefault()
      e.stopPropagation()
      drag.current.moved = false
    }
  }

  return (
    <div className="relative">
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className="flex cursor-grab snap-x snap-mandatory overflow-x-auto scroll-smooth select-none active:cursor-grabbing [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        className="absolute left-1 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel/85 text-3xl font-black leading-none text-fg shadow-lg backdrop-blur transition hover:bg-surface-2"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => scrollByPage(1)}
        aria-label="다음"
        className="absolute right-1 top-1/2 z-10 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-panel/85 text-3xl font-black leading-none text-fg shadow-lg backdrop-blur transition hover:bg-surface-2"
      >
        ›
      </button>
    </div>
  )
}
