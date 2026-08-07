'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { resolveFrameUrl } from '@/lib/cosmetics/frameUrl'
import { resolveRankBgUrl } from '@/lib/cosmetics/rankBgUrl'
import { rankEffectClass } from '@/lib/cosmetics/rankEffects'
import CardCarousel from '@/app/components/ui/CardCarousel'

// 동일한 스피너 컴포넌트
function Spinner({ size = 4 }: { size?: number }) {
    return (
        <svg className={`animate-spin h-${size} w-${size}`} viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
    )
}

// 동일한 입력창 스타일
const inputCls = `
  w-full px-4 py-2.5 rounded-xl text-sm font-medium text-fg
  bg-surface-2 border border-line
  placeholder:text-faint
  focus:outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5
  transition-all duration-200
`

type FrameRow = {
    id: string
    key: string
    label: string
    image_path: string
    is_active: boolean
    sort_order: number
    price_points: number
    is_purchasable: boolean
}
type EffectRow={id:string;label:string;description:string|null;effect_key:string|null;image_path:string|null;price_points:number;is_active:boolean;is_purchasable:boolean;sort_order:number}

export default function AdminFrameManager({ initialFrames,initialEffects }: { initialFrames: FrameRow[];initialEffects:EffectRow[] }) {
    const supabase = useMemo(() => createClient(), [])
    const router = useRouter()
    const [frames, setFrames] = useState<FrameRow[]>(initialFrames)
    const [effects,setEffects]=useState(initialEffects)
    // ranking_card_effects 는 authenticated/anon revoke 라 브라우저에서 재조회 불가 →
    // 업로드/삭제 후 router.refresh() 로 서버가 새 initialEffects 를 내려주면 동기화한다.
    useEffect(() => { setEffects(initialEffects) }, [initialEffects])


    // 프레임/배경 통합 업로드 폼 — 타입만 토글하고 입력 필드는 공유한다.
    const [uploadType, setUploadType] = useState<'frame' | 'background'>('frame')
    const [file, setFile] = useState<File | null>(null)
    const [key, setKey] = useState('')
    const [label, setLabel] = useState('')
    const [sortOrder, setSortOrder] = useState<number>(0)
    const [pricePoints, setPricePoints] = useState(50)

    function switchType(t: 'frame' | 'background') {
        setUploadType(t)
        setPricePoints(t === 'frame' ? 50 : 100) // 기본가
    }

    const [busy, setBusy] = useState(false)
    const [toast, setToast] = useState<string | null>(null)

    function show(msg: string) {
        setToast(msg)
        setTimeout(() => setToast(null), 2500)
    }

    function frameUrl(path: string) {
        const { data } = supabase.storage.from('profile-frames').getPublicUrl(path)
        return resolveFrameUrl(path,()=>data.publicUrl)
    }

    function bgUrl(path: string) {
        const { data } = supabase.storage.from('rank-backgrounds').getPublicUrl(path)
        return resolveRankBgUrl(path, () => data.publicUrl)
    }

    async function uploadBackground() {
        if (!file) return show('이미지 파일을 선택해줘.')
        if (!key.trim()) return show('key를 입력해줘.')
        if (!label.trim()) return show('label을 입력해줘.')

        setBusy(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('key', key.trim())
            fd.append('label', label.trim())
            fd.append('sort_order', String(sortOrder))
            fd.append('price_points', String(pricePoints))
            fd.append('is_purchasable', 'true')

            const res = await fetch('/api/admin/rank-backgrounds/upload', { method: 'POST', body: fd })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) throw new Error(data.message ?? '업로드 실패')

            show('배경 업로드 완료 ✅')
            setFile(null); setKey(''); setLabel(''); setSortOrder(0)
            router.refresh()
        } catch (e) {
            show(e instanceof Error ? e.message : '업로드 중 오류')
        } finally {
            setBusy(false)
        }
    }

    async function deleteBackground(row: EffectRow) {
        if (!confirm(`"${row.label}" 배경을 삭제할까요?`)) return

        setBusy(true)
        try {
            const res = await fetch('/api/admin/rank-backgrounds/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: row.id }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) throw new Error(data.message ?? '삭제 실패')

            show(data.deactivated ? '사용 중이라 비활성화했어요 ✅' : '삭제 완료 ✅')
            router.refresh()
        } catch (e) {
            show(e instanceof Error ? e.message : '삭제 중 오류')
        } finally {
            setBusy(false)
        }
    }

    async function reloadFrames() {
        const { data, error } = await supabase
            .from('profile_frames')
            .select('id,key,label,image_path,is_active,sort_order,price_points,is_purchasable')
            .order('sort_order', { ascending: true })

        if (error) throw error
        setFrames(data ?? [])
    }

    async function uploadFrame() {
        if (!file) return show('이미지 파일을 선택해줘.')
        if (!key.trim()) return show('key를 입력해줘.')
        if (!label.trim()) return show('label을 입력해줘.')

        setBusy(true)
        try {
            const fd = new FormData()
            fd.append('file', file)
            fd.append('key', key.trim())
            fd.append('label', label.trim())
            fd.append('sort_order', String(sortOrder))
            fd.append('price_points',String(pricePoints));fd.append('is_purchasable','true')

            const res = await fetch('/api/admin/profile-frames/upload', {
                method: 'POST',
                body: fd,
            })

            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) throw new Error(data.message ?? '업로드 실패')

            show('프레임 업로드 완료 ✅')
            setFile(null)
            setKey('')
            setLabel('')
            setSortOrder(0)
            setPricePoints(50)

            await reloadFrames()
        } catch (e) {
            show(e instanceof Error ? e.message : '업로드 중 오류')
        } finally {
            setBusy(false)
        }
    }

    async function deleteFrame(row: FrameRow) {
        if (!confirm(`"${row.label}" 프레임을 삭제할까요?`)) return

        setBusy(true)
        try {
            const res = await fetch('/api/admin/profile-frames/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: row.id, image_path: row.image_path }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) throw new Error(data.message ?? '삭제 실패')

            show('삭제 완료 ✅')
            await reloadFrames()
        } catch (e) {
            show(e instanceof Error ? e.message : '삭제 중 오류')
        } finally {
            setBusy(false)
        }
    }
    async function saveEffect(effect:EffectRow){setBusy(true);try{const res=await fetch('/api/admin/rank-effects',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(effect)});const data=await res.json();if(!res.ok)throw new Error(data.error??'수정 실패');show('효과 저장 완료 ✅')}catch(e){show(e instanceof Error?e.message:'수정 중 오류')}finally{setBusy(false)}}

    // 기존 프레임 개별 가격/라벨/정렬 저장 (효과 저장과 대칭)
    async function saveFrame(frame: FrameRow) {
        setBusy(true)
        try {
            const res = await fetch('/api/admin/profile-frames/update', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: frame.id, label: frame.label, price_points: frame.price_points, is_purchasable: frame.is_purchasable, is_active: frame.is_active, sort_order: frame.sort_order }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.error ?? '수정 실패')
            show('프레임 저장 완료 ✅')
        } catch (e) {
            show(e instanceof Error ? e.message : '수정 중 오류')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="space-y-8">
            {/* ── 헤더 ── */}
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-fg tracking-tight mb-1">상점 관리</h1>
                    <p className="text-sm text-subtle">상점에서 판매하는 프레임과 랭킹 카드 배경을 한 곳에서 관리합니다 (기본가 프레임 50P · 배경 100P, 개별 조정 가능)</p>
                </div>
            </header>

            {/* ── 알림 (Toast) ── */}
            {toast && (
                <div className="animate-in fade-in slide-in-from-top-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-warn-ink font-bold">
                    {toast}
                </div>
            )}

            {/* ── 통합 업로드 폼 (프레임/배경 토글) ── */}
            <section className="rounded-2xl border p-6 bg-surface" style={{ borderColor: 'var(--color-line)' }}>
                <div className="mb-6 flex flex-wrap items-center gap-3">
                    <div className="flex rounded-lg bg-surface-2 p-0.5 ring-1 ring-line">
                        {(['frame', 'background'] as const).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => switchType(t)}
                                className={`rounded-md px-4 py-1.5 text-xs font-black transition-colors ${
                                    uploadType === t
                                        ? (t === 'frame' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white')
                                        : 'text-muted hover:text-fg'
                                }`}
                            >
                                {t === 'frame' ? '프레임' : '배경'}
                            </button>
                        ))}
                    </div>
                    <h2 className="text-xs font-black text-muted tracking-widest uppercase">
                        New {uploadType === 'frame' ? 'Frame' : 'Background'}
                    </h2>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Key (고유이름)</label>
                        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={uploadType === 'frame' ? 'pengu_gold' : 'galaxy_bg'} className={inputCls} />
                    </div>
                    <div className="space-y-1.5"><label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">가격 (P)</label><input type="number" min={0} value={pricePoints} onChange={e=>setPricePoints(Number(e.target.value))} className={inputCls}/></div>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Label (표시이름)</label>
                        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={uploadType === 'frame' ? '펭구 골드' : '은하수 배경'} className={inputCls} />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Sort Order (정렬)</label>
                        <input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className={inputCls} />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Image File (PNG/WebP/JPG, 5MB 이하)</label>
                        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-[10px] file:font-black file:text-muted hover:file:bg-surface-2`} />
                    </div>
                </div>

                <button
                    disabled={busy}
                    onClick={uploadType === 'frame' ? uploadFrame : uploadBackground}
                    className={`mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg ${
                        uploadType === 'frame' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'
                    }`}
                >
                    {busy ? <Spinner size={4} /> : null}
                    {busy ? '처리 중' : uploadType === 'frame' ? '프레임 업로드' : '배경 업로드'}
                </button>
            </section>
            {/* ── 랭킹 카드 배경 (CSS 효과 + 이미지 배경 통합) ── */}
            <section className="rounded-2xl border border-line bg-surface p-6">
                <div className="mb-2 flex items-center gap-2">
                    <h2 className="text-sm font-black text-fg">랭킹 카드 배경</h2>
                    <span className="text-[10px] font-bold text-faint ml-auto">{effects.length} items</span>
                </div>
                <p className="mb-4 text-xs text-subtle">CSS 효과는 코드 내장이라 가격만 수정됩니다. 이미지 배경은 업로드분이라 삭제도 가능합니다.</p>
                {effects.length === 0 ? (
                    <p className="text-xs text-faint italic">등록된 배경이 없습니다.</p>
                ) : (
                    <CardCarousel perPage={6} pageClassName="grid gap-3" items={effects.map((e) => (
                        <div key={e.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 p-3">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-canvas isolate">
                                    {e.image_path
                                        ? <Image src={bgUrl(e.image_path)} alt={e.label} fill className="object-cover" unoptimized />
                                        : <div className={`absolute inset-0 ${rankEffectClass(e.effect_key)}`} />}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate font-bold text-fg">{e.label}</div>
                                    <div className="truncate text-[11px] text-muted">{e.image_path ? '이미지 배경' : `CSS · ${e.effect_key}`}{e.is_active ? '' : ' · 비활성'}</div>
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                                <label className="flex items-center gap-1 text-[11px] font-bold text-muted">
                                    <input type="number" min={0} value={e.price_points} onChange={(ev) => setEffects(effects.map((row) => row.id === e.id ? { ...row, price_points: Number(ev.target.value) } : row))} aria-label={`${e.label} 가격`} className="w-20 rounded-xl border border-line bg-surface px-3 py-2 text-sm font-medium text-fg focus:border-indigo-500/50 focus:outline-none" />
                                    P
                                </label>
                                <button disabled={busy} onClick={() => saveEffect(e)} className="rounded-xl bg-brand px-3 py-2 text-xs font-bold text-white transition-all hover:bg-indigo-500 disabled:opacity-50">저장</button>
                                {e.image_path && (
                                    <button disabled={busy} onClick={() => deleteBackground(e)} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-bold text-danger-ink transition-all hover:bg-red-500/20 disabled:opacity-30">삭제</button>
                                )}
                            </div>
                        </div>
                    ))} />
                )}
            </section>

            {/* ── 프레임 목록 ── */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    <h2 className="text-xs font-black text-muted tracking-widest uppercase">Frame List</h2>
                    <span className="text-[10px] font-bold text-faint ml-auto">{frames.length} items</span>
                </div>

                {frames.length === 0 ? (
                    <p className="py-8 text-center text-sm text-faint font-medium italic">등록된 프레임이 없습니다.</p>
                ) : (
                    <CardCarousel perPage={6} pageClassName="grid gap-3" items={frames.map((f, idx) => (
                        <div
                            key={f.id}
                            className="flex items-center justify-between gap-4 rounded-2xl border p-4 transition-all hover:bg-surface"
                            style={{
                                background: idx % 2 === 0 ? 'var(--color-surface)' : 'transparent',
                                borderColor: 'var(--color-line)'
                            }}
                        >
                            <div className="flex items-center gap-4">
                                {/* 프레임 미리보기 */}
                                <div className="relative w-14 h-14 rounded-xl bg-surface-2 border border-line flex-shrink-0">
                                    <Image src={frameUrl(f.image_path)} alt={f.label} fill className="object-contain p-2" />
                                </div>

                                <div className="min-w-0">
                                    <div className="text-fg font-bold text-sm truncate">{f.label}</div>
                                    <div className="text-[11px] text-subtle font-medium flex items-center gap-2 mt-0.5">
                                        <span className="bg-surface px-1.5 py-0.5 rounded text-muted">key: {f.key}</span>
                                        <span>order: {f.sort_order}</span>
                                    </div>
                                    <div className="text-[10px] text-faint truncate max-w-[150px] sm:max-w-xs mt-1">{f.image_path}</div>
                                </div>
                            </div>

                            <div className="flex flex-shrink-0 items-center gap-2">
                                <label className="flex items-center gap-1 text-[11px] font-bold text-muted">
                                    <input
                                        type="number"
                                        min={0}
                                        value={f.price_points}
                                        onChange={(e) => setFrames(frames.map((row, i) => i === idx ? { ...row, price_points: Number(e.target.value) } : row))}
                                        aria-label={`${f.label} 가격`}
                                        className="w-20 px-3 py-2 rounded-xl text-sm font-medium text-fg bg-surface-2 border border-line focus:outline-none focus:border-indigo-500/50"
                                    />
                                    P
                                </label>
                                <button
                                    disabled={busy}
                                    onClick={() => saveFrame(f)}
                                    className="px-3 py-2 rounded-xl text-xs font-bold bg-brand text-white hover:bg-indigo-500 disabled:opacity-40 transition-all"
                                >
                                    저장
                                </button>
                                <button
                                    disabled={busy}
                                    onClick={() => deleteFrame(f)}
                                    className="px-4 py-2 rounded-xl text-xs font-bold text-danger-ink bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:text-danger-ink disabled:opacity-30 transition-all"
                                >
                                    삭제
                                </button>
                            </div>
                        </div>
                    ))} />
                )}
            </section>
        </div>
    )
}
