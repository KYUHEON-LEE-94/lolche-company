'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/browser'

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
        } catch (e: any) {
            show(e?.message ?? '업로드 중 오류')
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
        } catch (e: any) {
            show(e?.message ?? '삭제 중 오류')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="grid gap-6">
            <header className="flex items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-black text-gray-900">프레임 관리</h1>
                    <p className="mt-1 text-sm text-gray-600">관리자만 프레임을 추가/삭제할 수 있어요.</p>
                </div>
            </header>

            {toast && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
                    {toast}
                </div>
            )}

            {/* 업로드 폼 */}
            <section className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
                <div className="text-gray-900 font-extrabold mb-4">프레임 추가</div>

                <div className="grid gap-4 sm:grid-cols-2">
                    <label className="grid gap-1">
                        <span className="text-xs text-gray-500">key (unique)</span>
                        <input
                            value={key}
                            onChange={(e) => setKey(e.target.value)}
                            placeholder="pengu_gold"
                            className="rounded-lg bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </label>

                    <label className="grid gap-1">
                        <span className="text-xs text-gray-500">label</span>
                        <input
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="펭구 골드"
                            className="rounded-lg bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </label>

                    <label className="grid gap-1">
                        <span className="text-xs text-gray-500">sort_order</span>
                        <input
                            type="number"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(Number(e.target.value))}
                            className="rounded-lg bg-white border border-gray-300 px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                        />
                    </label>

                    <label className="grid gap-1">
                        <span className="text-xs text-gray-500">image file</span>
                        <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                            className="rounded-lg bg-white border border-gray-300 px-3 py-2 text-gray-900 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
                        />
                    </label>
                </div>

                <button
                    disabled={busy}
                    onClick={uploadFrame}
                    className="mt-5 inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-bold bg-amber-500 text-gray-900 hover:bg-amber-400 disabled:opacity-50"
                >
                    {busy ? '처리 중...' : '프레임 업로드'}
                </button>
            </section>

            {/* 목록 */}
            <section className="rounded-2xl bg-white border border-gray-200 p-6 shadow-sm">
                <div className="text-gray-900 font-extrabold mb-4">프레임 목록</div>

                <div className="grid gap-3">
                    {frames.map((f) => (
                        <div
                            key={f.id}
                            className="flex items-center justify-between gap-4 rounded-xl bg-white border border-gray-200 p-4"
                        >
                            <div className="flex items-center gap-4">
                                <div className="relative w-14 h-14 rounded-lg bg-gray-50 border border-gray-200">
                                    <Image src={frameUrl(f.image_path)} alt={f.label} fill className="object-contain p-1" />
                                </div>
                                <div>
                                    <div className="text-gray-900 font-bold">{f.label}</div>
                                    <div className="text-xs text-gray-600">
                                        key: {f.key} · order: {f.sort_order}
                                    </div>
                                    <div className="text-xs text-gray-400">{f.image_path}</div>
                                </div>
                            </div>

                            <button
                                disabled={busy}
                                onClick={() => deleteFrame(f)}
                                className="px-4 py-2 rounded-lg text-sm font-bold bg-rose-600 text-white hover:bg-rose-500 disabled:opacity-50"
                            >
                                삭제
                            </button>
                        </div>
                    ))}

                    {frames.length === 0 && <div className="text-sm text-gray-500">등록된 프레임이 없어요.</div>}
                </div>
            </section>
        </div>
    )
}
