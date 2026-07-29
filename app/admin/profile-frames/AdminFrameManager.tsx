'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/browser'

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
}

export default function AdminFrameManager({ initialFrames }: { initialFrames: FrameRow[] }) {
    const supabase = useMemo(() => createClient(), [])
    const [frames, setFrames] = useState<FrameRow[]>(initialFrames)

    const [file, setFile] = useState<File | null>(null)
    const [key, setKey] = useState('')
    const [label, setLabel] = useState('')
    const [sortOrder, setSortOrder] = useState<number>(0)

    const [busy, setBusy] = useState(false)
    const [toast, setToast] = useState<string | null>(null)

    function show(msg: string) {
        setToast(msg)
        setTimeout(() => setToast(null), 2500)
    }

    function frameUrl(path: string) {
        const { data } = supabase.storage.from('profile-frames').getPublicUrl(path)
        return data.publicUrl
    }

    async function reloadFrames() {
        const { data, error } = await supabase
            .from('profile_frames')
            .select('id,key,label,image_path,is_active,sort_order')
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

    return (
        <div className="space-y-8">
            {/* ── 헤더 ── */}
            <header className="flex items-start justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-fg tracking-tight mb-1">프레임 관리</h1>
                    <p className="text-sm text-subtle">프로필을 꾸며줄 전용 프레임을 추가하거나 삭제합니다</p>
                </div>
            </header>

            {/* ── 알림 (Toast) ── */}
            {toast && (
                <div className="animate-in fade-in slide-in-from-top-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 text-sm text-warn-ink font-bold">
                    {toast}
                </div>
            )}

            {/* ── 업로드 폼 ── */}
            <section className="rounded-2xl border p-6 bg-surface" style={{ borderColor: 'var(--color-line)' }}>
                <div className="flex items-center gap-2 mb-6">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    <h2 className="text-xs font-black text-muted tracking-widest uppercase">New Frame</h2>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Key (고유이름)</label>
                        <input
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder="pengu_gold"
                            className={inputCls}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Label (표시이름)</label>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="펭구 골드"
                            className={inputCls}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Sort Order (정렬)</label>
                        <input
                            type="number"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(Number(e.target.value))}
                            className={inputCls}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="block text-[10px] font-black text-subtle tracking-widest uppercase ml-1">Image File</label>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className={`${inputCls} file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:text-[10px] file:font-black file:text-muted hover:file:bg-surface-2`}
                        />
                    </div>
                </div>

                <button
                    disabled={busy}
                    onClick={uploadFrame}
                    className="mt-6 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/20"
                >
                    {busy ? <Spinner size={4} /> : null}
                    {busy ? '처리 중' : '프레임 업로드'}
                </button>
            </section>

            {/* ── 프레임 목록 ── */}
            <section className="space-y-4">
                <div className="flex items-center gap-2 px-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                    <h2 className="text-xs font-black text-muted tracking-widest uppercase">Frame List</h2>
                    <span className="text-[10px] font-bold text-faint ml-auto">{frames.length} items</span>
                </div>

                <div className="grid gap-3">
                    {frames.map((f, idx) => (
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

                            <button
                                disabled={busy}
                                onClick={() => deleteFrame(f)}
                                className="flex-shrink-0 px-4 py-2 rounded-xl text-xs font-bold text-danger-ink bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 hover:text-danger-ink disabled:opacity-30 transition-all"
                            >
                                삭제
                            </button>
                        </div>
                    ))}

                    {frames.length === 0 && (
                        <div className="text-center py-12 rounded-2xl border border-dashed border-line">
                            <p className="text-sm text-faint font-medium italic">등록된 프레임이 없습니다.</p>
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}