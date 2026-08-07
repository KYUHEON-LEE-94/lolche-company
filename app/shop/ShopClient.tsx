'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { resolveFrameUrl } from '@/lib/cosmetics/frameUrl'
import { rankEffectClass } from '@/lib/cosmetics/rankEffects'
import { ALERT } from '@/lib/ui/styles'

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
type Effect = { id: string; label: string; description: string | null; effect_key: string; price_points: number; owned: boolean; equipped: boolean }
type LedgerItem = { id: number; amount: number; description: string | null; created_at: string; balance_after: number }

type Status = 'loading' | 'ok' | 'unauth' | 'forbidden' | 'migration' | 'error'

function framePublicUrl(imagePath: string) {
  return resolveFrameUrl(imagePath, (path) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-frames/${encodeURIComponent(path).replaceAll('%2F', '/')}`)
}

export default function ShopClient() {
  const router = useRouter()

  const [status, setStatus] = useState<Status>('loading')
  const [frames, setFrames] = useState<Frame[]>([])
  const [effects, setEffects] = useState<Effect[]>([])
  const [balance, setBalance] = useState(0)
  const [ledger, setLedger] = useState<LedgerItem[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const response = await fetch('/api/me/cosmetics', { cache: 'no-store' })
      const data: unknown = await response.json().catch(() => null)
      if (!mounted) return
      if (response.status === 401) { setStatus('unauth'); return }
      if (response.status === 403) { setStatus('forbidden'); return }
      if (!response.ok || !data || typeof data !== 'object') { setStatus('error'); return }
      const shop = data as { frames?: Frame[]; effects?: Effect[]; balance?: number; isAdmin?: boolean; ledger?: LedgerItem[]; migration_required?: boolean }
      setFrames(shop.frames ?? [])
      setEffects(shop.effects ?? [])
      setBalance(shop.balance ?? 0)
      setIsAdmin(Boolean(shop.isAdmin))
      setLedger(shop.ledger ?? [])
      setStatus(shop.migration_required ? 'migration' : 'ok')
    })()
    return () => { mounted = false }
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  async function itemAction(itemType: 'frame' | 'rank_effect', item: { id: string; owned: boolean; equipped: boolean; price_points: number }) {
    setBusy(true)
    try {
      if (!item.owned) {
        if (!confirm(`${item.price_points}P로 구매할까요?`)) return
        const r = await fetch('/api/me/cosmetics/purchase', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemType, itemId: item.id }) })
        const b = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(b.error ?? '구매 실패')
        setBalance(typeof b.balance === 'number' ? b.balance : balance - item.price_points)
      }
      const r = await fetch('/api/me/cosmetics/equip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemType, itemId: item.equipped ? null : item.id }) })
      const b = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(b.error ?? '장착 실패')
      if (itemType === 'frame') {
        setFrames(frames.map((f) => ({ ...f, owned: f.id === item.id ? true : f.owned, equipped: f.id === item.id ? !item.equipped : false })))
      } else {
        setEffects(effects.map((e) => ({ ...e, owned: e.id === item.id ? true : e.owned, equipped: e.id === item.id ? !item.equipped : false })))
      }
      showToast('반영됐어요 ✅')
    } catch (e) {
      showToast(e instanceof Error ? e.message : '처리 중 오류')
    } finally {
      setBusy(false)
    }
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
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
          {frames.length === 0 ? (
            <div className="text-xs text-muted">등록된 프레임이 없어요.</div>
          ) : (
            frames.map((f) => {
              const url = framePublicUrl(f.image_path)
              const disabled = busy || (!f.owned && balance < f.price_points)
              return (
                <button
                  key={f.id}
                  disabled={disabled}
                  onClick={() => itemAction('frame', f)}
                  className={[
                    'rounded-2xl p-4 ring-1 transition text-left',
                    f.equipped ? 'bg-amber-500/10 ring-amber-400/60' : 'bg-surface-2 ring-line hover:bg-surface',
                    disabled ? 'opacity-50' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative w-12 h-12 shrink-0">
                      <Image src={url} alt={f.label} fill className="object-contain" />
                    </div>
                    <div>
                      <div className="text-fg font-bold">{f.label}</div>
                      <div className="mt-0.5 text-xs">
                        <span className="font-black text-brand-ink">{f.price_points === 0 ? '무료' : `${f.price_points.toLocaleString()}P`}</span>
                        {f.equipped ? <span className="text-warn-ink"> · 장착 중</span> : f.owned ? <span className="text-muted"> · 보유</span> : null}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>

      {/* 랭킹 카드 배경 카탈로그 */}
      <section className="rounded-3xl bg-surface ring-1 ring-line p-6">
        <div className="text-fg font-extrabold">랭킹 카드 배경</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {effects.length === 0 ? (
            <div className="text-xs text-muted">등록된 효과가 없어요.</div>
          ) : (
            effects.map((e) => {
              const disabled = busy || (!e.owned && balance < e.price_points)
              return (
                <button
                  key={e.id}
                  disabled={disabled}
                  onClick={() => itemAction('rank_effect', e)}
                  className={`rounded-2xl border p-4 text-left ${e.equipped ? 'border-brand bg-brand/10' : 'border-line bg-surface-2'} disabled:opacity-40`}
                >
                  {/* 실제 이펙트 미리보기 — 설명 대신 눈으로 바로 확인 */}
                  <div className={`relative mb-3 h-16 w-full overflow-hidden rounded-xl ring-1 ring-line bg-canvas ${rankEffectClass(e.effect_key)}`} aria-hidden />
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold text-fg">{e.label}</div>
                    <div className="text-xs whitespace-nowrap">
                      <span className="font-black text-brand-ink">{e.price_points === 0 ? '무료' : `${e.price_points.toLocaleString()}P`}</span>
                      {e.equipped ? <span className="text-warn-ink"> · 장착 중</span> : e.owned ? <span className="text-muted"> · 보유</span> : null}
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </section>

      {/* 포인트 내역 */}
      {ledger.length > 0 && (
        <section className="rounded-3xl bg-surface ring-1 ring-line p-5">
          <div className="font-extrabold text-fg">포인트 내역</div>
          <ul className="mt-3 divide-y divide-line">
            {ledger.slice(0, 5).map((row) => (
              <li key={row.id} className="flex items-center justify-between py-2 text-xs">
                <span className="truncate text-muted">{row.description ?? '포인트 변동'}</span>
                <b className={row.amount > 0 ? 'text-ok-ink' : 'text-danger-ink'}>{row.amount > 0 ? '+' : ''}{row.amount.toLocaleString()}P</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
