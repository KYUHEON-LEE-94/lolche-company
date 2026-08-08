'use client'

import { useEffect, useRef } from 'react'
import Image from 'next/image'
import { createPortal } from 'react-dom'
import { isSpinningFrame } from '@/lib/cosmetics/frameUrl'
import { rankEffectClass } from '@/lib/cosmetics/rankEffects'
import { BTN_GHOST } from '@/lib/ui/styles'

/**
 * 상점 미리보기 — 고르는 아이템을 "지금 장착한 나"에 얹어 보여준다.
 *
 * 프레임과 배경은 서로 다른 축이라 한쪽만 미리 볼 수 있으면 조합을 판단할 수 없다.
 * 그래서 미리보는 아이템 1개 + 나머지는 현재 장착값을 그대로 합성한다.
 *
 * 실제 노출 지점이 랭킹 행과 상세 패널 헤더 두 곳이고 크기·비율이 크게 달라
 * (행 36px 아바타 / 헤더 80px) 둘 다 보여준다.
 */

export type PreviewTarget = {
  kind: 'frame' | 'background'
  label: string
  /** frame: 프레임 이미지 URL */
  frameUrl?: string | null
  /** frame: frame-spin 판정용 원본 경로 */
  framePath?: string | null
  /** background: 이미지 배경 URL (CSS 프리셋이면 null) */
  bgImageUrl?: string | null
  /** background: CSS 프리셋 키 (이미지 배경이면 null) */
  bgEffectKey?: string | null
}

export type PreviewViewer = {
  name: string
  avatarUrl: string | null
  tier: string | null
  rank: string | null
  lp: number | null
}

/** 현재 장착 중인 값 — 미리보는 축은 target 이 덮어쓴다. */
export type EquippedLook = {
  frameUrl: string | null
  framePath: string | null
  bgImageUrl: string | null
  bgEffectKey: string | null
}

function Avatar({ viewer, sizeClass }: { viewer: PreviewViewer; sizeClass: string }) {
  if (viewer.avatarUrl) {
    return <Image src={viewer.avatarUrl} alt="" fill sizes="80px" className="object-cover" unoptimized />
  }
  return (
    <span className={`flex h-full w-full items-center justify-center font-black text-subtle ${sizeClass}`}>
      {viewer.name.slice(0, 1)}
    </span>
  )
}

export default function CosmeticPreviewModal({
  target,
  viewer,
  equipped,
  onClose,
}: {
  target: PreviewTarget
  viewer: PreviewViewer
  equipped: EquippedLook
  onClose: () => void
}) {
  const closeRef = useRef<HTMLButtonElement>(null)

  // 미리보는 축만 target 으로 교체하고 나머지는 현재 장착값을 유지한다.
  const frameUrl = target.kind === 'frame' ? target.frameUrl ?? null : equipped.frameUrl
  const framePath = target.kind === 'frame' ? target.framePath ?? null : equipped.framePath
  const bgImageUrl = target.kind === 'background' ? target.bgImageUrl ?? null : equipped.bgImageUrl
  const bgEffectKey = target.kind === 'background' ? target.bgEffectKey ?? null : equipped.bgEffectKey

  useEffect(() => {
    closeRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 스크롤 잠금 — 모달 뒤 상점이 같이 스크롤되면 미리보기가 화면 밖으로 밀린다.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  const rankText = viewer.tier ? `${viewer.tier} ${viewer.rank ?? ''} · ${viewer.lp ?? 0} LP` : '언랭크'
  const spinning = framePath ? isSpinningFrame(framePath) : false

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${target.label} 미리보기`}
        className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-panel ring-1 ring-line shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs text-subtle">미리보기</p>
            <p className="truncate font-black text-fg">{target.label}</p>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="닫기"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2-solid text-fg ring-1 ring-line-strong transition-colors hover:bg-surface">
            ✕
          </button>
        </div>

        <div className="grid gap-5 p-5">
          {/* ① 랭킹 목록에서의 모습 */}
          <div>
            <p className="mb-2 text-[11px] font-bold text-subtle">랭킹 목록</p>
            <div className="overflow-hidden rounded-2xl border border-line bg-surface">
              <div className={`relative isolate flex min-h-[76px] items-center gap-3 overflow-hidden py-3.5 pl-3 pr-3 ${rankEffectClass(bgEffectKey)}`}>
                {bgImageUrl && (
                  <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
                    <Image src={bgImageUrl} alt="" fill sizes="512px" className="object-cover opacity-90" unoptimized />
                    {/* RankCardBackground 의 스크림과 동일하게 유지할 것 — 미리보기가 실물과 달라지면 안 된다 */}
                    <div className="absolute inset-0 bg-gradient-to-r from-panel/88 from-28% via-panel/30 via-50% to-panel/88 to-74%" />
                  </div>
                )}
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-gradient-to-b from-yellow-400 to-amber-500 opacity-70" />

                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 text-xs font-black text-white shadow-md shadow-amber-500/40 ring-1 ring-yellow-300/60">
                  1
                </div>

                <div className="relative h-9 w-9 shrink-0">
                  {frameUrl && (
                    <div className="pointer-events-none absolute -inset-[34%] z-20">
                      <Image src={frameUrl} alt="" fill sizes="52px" className={`object-contain ${spinning ? 'frame-spin' : ''}`} />
                    </div>
                  )}
                  <div className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-line bg-surface-2">
                    <Avatar viewer={viewer} sizeClass="text-xs" />
                  </div>
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold leading-tight text-fg drop-shadow">{viewer.name}</p>
                  <p className="truncate text-[11px] leading-tight text-muted drop-shadow">{rankText}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ② 상세 전적 패널 헤더에서의 모습 */}
          <div>
            <p className="mb-2 text-[11px] font-bold text-subtle">상세 전적 패널</p>
            <div className="overflow-hidden rounded-2xl border border-line">
              <div className={`relative isolate flex items-center gap-4 overflow-hidden px-5 py-6 ${rankEffectClass(bgEffectKey)}`}>
                {bgImageUrl && (
                  <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden>
                    <Image src={bgImageUrl} alt="" fill sizes="512px" className="object-cover opacity-90" unoptimized />
                  </div>
                )}
                {/* 실제 패널과 동일한 가독성 스크림. 패널은 RankCardBackground 의 공용 스크림을
                    scrim={false} 로 끄고 이 좌측 강조형만 쓰므로 미리보기도 그대로 맞춘다. */}
                <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-panel/85 via-panel/45 to-panel/15" aria-hidden />

                <div className="relative h-20 w-20 shrink-0">
                  {frameUrl && (
                    <div className="pointer-events-none absolute -inset-[34%] z-20">
                      <Image src={frameUrl} alt="" fill sizes="120px" className={`object-contain ${spinning ? 'frame-spin' : ''}`} />
                    </div>
                  )}
                  <div className="relative z-10 flex h-full w-full items-center justify-center overflow-hidden rounded-full border-2 border-white/15 bg-surface-2 shadow-lg">
                    <Avatar viewer={viewer} sizeClass="text-lg" />
                  </div>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-lg font-black leading-tight text-fg drop-shadow">{viewer.name}</p>
                  {/* 실제 패널과 동일: 헤더 스크림이 약한 위치라 muted 로는 AA 미달 */}
                  <p className="mt-0.5 text-[11px] text-fg/75 drop-shadow">{rankText}</p>
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-faint">
            지금 장착 중인 다른 꾸밈과 함께 보여드려요. 실제 화면과 약간 다를 수 있어요.
          </p>

          <button type="button" onClick={onClose} className={BTN_GHOST}>닫기</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
