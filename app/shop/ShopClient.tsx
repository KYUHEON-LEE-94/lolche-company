'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolveFrameUrl, isSpinningFrame } from '@/lib/cosmetics/frameUrl'
import { resolveRankBgUrl } from '@/lib/cosmetics/rankBgUrl'
import { rankEffectClass } from '@/lib/cosmetics/rankEffects'
import { ALERT } from '@/lib/ui/styles'
import CardCarousel from '@/app/components/ui/CardCarousel'
import CosmeticPreviewModal, { type PreviewTarget, type PreviewViewer, type EquippedLook } from './CosmeticPreviewModal'

type Frame = {
  id: string
  key: string
  label: string
  image_path: string
  sort_order: number
  price_points: number
  owned: boolean
  equipped: boolean
}
type Effect = { id: string; label: string; description: string | null; effect_key: string | null; image_path: string | null; price_points: number; owned: boolean; equipped: boolean }

type Status = 'loading' | 'ok' | 'unauth' | 'forbidden' | 'migration' | 'error'

// 카드 액션 버튼 — 캐러셀 드래그와 겹치지 않도록 카드 전체가 아니라 이 버튼들만 클릭 대상이다.
// whitespace-nowrap: 3열 그리드에서 카드가 좁아 "미리보기"가 두 줄로 깨진다.
const ACTION_BTN = 'flex-1 whitespace-nowrap rounded-lg px-2 py-1.5 text-[11px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed'
const PREVIEW_BTN = `${ACTION_BTN} bg-surface-2-solid text-fg ring-1 ring-line-strong hover:bg-surface`
const BUY_BTN = `${ACTION_BTN} bg-brand text-white hover:bg-brand/85`
const EQUIP_BTN = `${ACTION_BTN} bg-brand/10 border border-brand/30 text-brand-ink hover:bg-brand/20`
const UNEQUIP_BTN = `${ACTION_BTN} bg-surface-2 text-muted ring-1 ring-line hover:text-fg`

function framePublicUrl(imagePath: string) {
  return resolveFrameUrl(imagePath, (path) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-frames/${encodeURIComponent(path).replaceAll('%2F', '/')}`)
}

function bgPublicUrl(imagePath: string) {
  return resolveRankBgUrl(imagePath, (path) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rank-backgrounds/${encodeURIComponent(path).replaceAll('%2F', '/')}`)
}

export default function ShopClient() {
  const router = useRouter()

  const [status, setStatus] = useState<Status>('loading')
  const [frames, setFrames] = useState<Frame[]>([])
  const [effects, setEffects] = useState<Effect[]>([])
  const [balance, setBalance] = useState(0)
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [viewer, setViewer] = useState<PreviewViewer | null>(null)
  const [preview, setPreview] = useState<PreviewTarget | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const response = await fetch('/api/me/cosmetics', { cache: 'no-store' })
      const data: unknown = await response.json().catch(() => null)
      if (!mounted) return
      if (response.status === 401) { setStatus('unauth'); return }
      if (response.status === 403) { setStatus('forbidden'); return }
      if (!response.ok || !data || typeof data !== 'object') { setStatus('error'); return }
      const shop = data as { frames?: Frame[]; effects?: Effect[]; balance?: number; isAdmin?: boolean; migration_required?: boolean; viewer?: PreviewViewer }
      setFrames(shop.frames ?? [])
      setEffects(shop.effects ?? [])
      setBalance(shop.balance ?? 0)
      setIsAdmin(Boolean(shop.isAdmin))
      setViewer(shop.viewer ?? null)
      setStatus(shop.migration_required ? 'migration' : 'ok')
    })()
    return () => { mounted = false }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  /** 소유 상태만 갱신 — 구매는 장착을 겸하지 않는다(장착은 별도 버튼). */
  function markOwned(itemType: 'frame' | 'rank_effect', itemId: string) {
    if (itemType === 'frame') setFrames((prev) => prev.map((f) => (f.id === itemId ? { ...f, owned: true } : f)))
    else setEffects((prev) => prev.map((e) => (e.id === itemId ? { ...e, owned: true } : e)))
  }

  /** 장착은 한 축에 하나뿐이라 같은 종류의 나머지는 모두 해제한다. */
  function markEquipped(itemType: 'frame' | 'rank_effect', itemId: string, nextEquipped: boolean) {
    if (itemType === 'frame') setFrames((prev) => prev.map((f) => ({ ...f, equipped: f.id === itemId ? nextEquipped : false })))
    else setEffects((prev) => prev.map((e) => ({ ...e, equipped: e.id === itemId ? nextEquipped : false })))
  }

  async function purchase(itemType: 'frame' | 'rank_effect', item: { id: string; label: string; price_points: number }) {
    if (!confirm(`'${item.label}'을(를) ${item.price_points.toLocaleString()}P로 구매할까요?`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/me/cosmetics/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemType, itemId: item.id }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error ?? '구매 실패')
      setBalance(typeof b.balance === 'number' ? b.balance : balance - item.price_points)
      markOwned(itemType, item.id)
      showToast('구매했어요 ✅ 장착 버튼으로 적용할 수 있어요.')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '처리 중 오류')
    } finally {
      setBusy(false)
    }
  }

  async function equip(itemType: 'frame' | 'rank_effect', item: { id: string; equipped: boolean }) {
    setBusy(true)
    try {
      const next = !item.equipped
      const r = await fetch('/api/me/cosmetics/equip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemType, itemId: next ? item.id : null }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error ?? '장착 실패')
      markEquipped(itemType, item.id, next)
      showToast(next ? '장착했어요 ✅' : '해제했어요')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '처리 중 오류')
    } finally {
      setBusy(false)
    }
  }

  /** 미리보기에 합성할 현재 장착값. 미리보는 축은 모달이 덮어쓴다. */
  const equippedLook: EquippedLook = {
    frameUrl: (() => { const f = frames.find((x) => x.equipped); return f ? framePublicUrl(f.image_path) : null })(),
    framePath: frames.find((x) => x.equipped)?.image_path ?? null,
    bgImageUrl: (() => { const e = effects.find((x) => x.equipped && x.image_path); return e?.image_path ? bgPublicUrl(e.image_path) : null })(),
    bgEffectKey: effects.find((x) => x.equipped && !x.image_path)?.effect_key ?? null,
  }

  if (status === 'loading') return <div className="text-sm text-muted">상점 정보를 불러오는 중…</div>
  if (status === 'unauth') return <div className={ALERT.warn}>로그인이 필요합니다. <Link href="/login" className="font-bold underline">로그인하기</Link></div>
  if (status === 'forbidden') return <div className={ALERT.warn}>승인된 멤버만 상점을 이용할 수 있어요. <Link href="/profile" className="font-bold underline">프로필에서 멤버 등록</Link></div>
  if (status === 'error') return <div className={ALERT.error}>상점 정보를 불러오지 못했습니다.</div>

  return (
    <div className="grid gap-6">
      {status === 'migration' && <div className={ALERT.warn}>상점 기능이 준비 중이에요. 잠시 후 다시 시도해 주세요.</div>}

      {/* 잔액 + 관리 */}
      <section className="flex items-center justify-between rounded-3xl bg-surface ring-1 ring-line p-5">
        <div>
          <div className="text-xs text-muted">보유 포인트</div>
          <div className="mt-0.5 text-2xl font-black text-brand-ink">{balance.toLocaleString()}P</div>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => router.push('/admin/profile-frames')}
            className="px-4 py-2 rounded-xl text-sm font-bold bg-surface-2 border border-line text-fg hover:bg-surface transition"
          >
            상점 관리
          </button>
        )}
      </section>

      {toast && <div className="rounded-2xl bg-surface-2 ring-1 ring-line px-4 py-3 text-sm text-fg">{toast}</div>}

      {/* 프레임 카탈로그 */}
      <section className="rounded-3xl bg-surface ring-1 ring-line p-6">
        <div className="text-fg font-extrabold">프로필 프레임</div>
        {frames.length === 0 ? (
          <div className="mt-5 text-xs text-muted">등록된 프레임이 없어요.</div>
        ) : (
          <div className="mt-5">
            <CardCarousel perPage={9} pageClassName="grid grid-cols-3 gap-4" items={
            frames.map((f) => {
              const url = framePublicUrl(f.image_path)
              const tooPoor = !f.owned && balance < f.price_points
              return (
                <div
                  key={f.id}
                  className={[
                    'rounded-2xl p-4 ring-1 transition',
                    f.equipped ? 'bg-amber-500/10 ring-amber-400/60' : 'bg-surface-2 ring-line',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 shrink-0">
                      <Image src={url} alt={f.label} fill className={`object-contain ${isSpinningFrame(f.image_path) ? 'frame-spin' : ''}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-fg font-bold truncate">{f.label}</div>
                      <div className="mt-0.5 text-xs">
                        <span className="font-black text-brand-ink">{f.price_points === 0 ? '무료' : `${f.price_points.toLocaleString()}P`}</span>
                        {f.equipped ? <span className="text-warn-ink"> · 장착 중</span> : f.owned ? <span className="text-muted"> · 보유</span> : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={() => setPreview({ kind: 'frame', label: f.label, frameUrl: url, framePath: f.image_path })} className={PREVIEW_BTN}>
                      미리보기
                    </button>
                    {f.owned ? (
                      <button type="button" disabled={busy} onClick={() => equip('frame', f)} className={f.equipped ? UNEQUIP_BTN : EQUIP_BTN}>
                        {f.equipped ? '해제' : '장착'}
                      </button>
                    ) : (
                      <button type="button" disabled={busy || tooPoor} onClick={() => purchase('frame', f)} className={BUY_BTN} title={tooPoor ? '포인트가 부족해요' : undefined}>
                        {tooPoor ? '포인트 부족' : '구매'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
            } />
          </div>
        )}
      </section>

      {/* 랭킹 카드 배경 카탈로그 */}
      <section className="rounded-3xl bg-surface ring-1 ring-line p-6">
        <div className="text-fg font-extrabold">랭킹 카드 배경</div>
        {effects.length === 0 ? (
          <div className="mt-4 text-xs text-muted">등록된 효과가 없어요.</div>
        ) : (
          <div className="mt-4">
            <CardCarousel perPage={9} pageClassName="grid grid-cols-3 gap-3" items={
            effects.map((e) => {
              const tooPoor = !e.owned && balance < e.price_points
              return (
                <div
                  key={e.id}
                  className={`rounded-2xl border p-4 ${e.equipped ? 'border-brand bg-brand/10' : 'border-line bg-surface-2'}`}
                >
                  {/* 실제 배경 미리보기 — 이미지 배경이면 이미지, 아니면 CSS 이펙트 */}
                  <div className={`relative mb-3 h-16 w-full overflow-hidden rounded-xl ring-1 ring-line bg-canvas ${e.image_path ? '' : rankEffectClass(e.effect_key)}`} aria-hidden>
                    {e.image_path && <Image src={bgPublicUrl(e.image_path)} alt="" fill sizes="200px" className="object-cover" />}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-fg truncate">{e.label}</div>
                    <div className="text-xs whitespace-nowrap">
                      <span className="font-black text-brand-ink">{e.price_points === 0 ? '무료' : `${e.price_points.toLocaleString()}P`}</span>
                      {e.equipped ? <span className="text-warn-ink"> · 장착 중</span> : e.owned ? <span className="text-muted"> · 보유</span> : null}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPreview({ kind: 'background', label: e.label, bgImageUrl: e.image_path ? bgPublicUrl(e.image_path) : null, bgEffectKey: e.image_path ? null : e.effect_key })}
                      className={PREVIEW_BTN}
                    >
                      미리보기
                    </button>
                    {e.owned ? (
                      <button type="button" disabled={busy} onClick={() => equip('rank_effect', e)} className={e.equipped ? UNEQUIP_BTN : EQUIP_BTN}>
                        {e.equipped ? '해제' : '장착'}
                      </button>
                    ) : (
                      <button type="button" disabled={busy || tooPoor} onClick={() => purchase('rank_effect', e)} className={BUY_BTN} title={tooPoor ? '포인트가 부족해요' : undefined}>
                        {tooPoor ? '포인트 부족' : '구매'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })
            } />
          </div>
        )}
      </section>

      {/* viewer 는 표시용 degrade 대상이라 null 일 수 있다. 그때도 미리보기는 열려야 하므로
          이름만 있는 최소 뷰어로 대체한다(아바타 자리에 이니셜). */}
      {preview && (
        <CosmeticPreviewModal
          target={preview}
          viewer={viewer ?? { name: '나', avatarUrl: null, tier: null, rank: null, lp: null }}
          equipped={equippedLook}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}
