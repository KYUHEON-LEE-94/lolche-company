'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/browser'

type Props = {
    userId: string
    member: {
        id: string
        member_name: string
        riot_id: string
        profile_image_path: string | null
        profile_frame_path: string | null
        profile_updated_at: string | null
    }
}

const FRAME_PRESETS = [
    { key: 'gold', label: '펭구', path: '/frames/frame1.png' },
    { key: 'silver', label: '펭구링', path: '/frames/frame2.png' },
    { key: 'emerald', label: '픽셀 펭구', path: '/frames/frame3.png' },
] as const

export default function ProfileEditor({ userId, member }: Props) {

    const supabase = useMemo(() => createClient(), [])

    useEffect(() => {
        supabase.auth.getUser().then(({ data, error }) => {
            console.log('client getUser error=', error?.message)
            console.log('client auth.uid=', data.user?.id)
        })
    }, [supabase])
    // DB 초기값 → state로 복사해서 이후 즉시 반영되게
    const [imagePath, setImagePath] = useState<string | null>(member.profile_image_path)
    const [framePath, setFramePath] = useState<string | null>(member.profile_frame_path)

    const [imageUrl, setImageUrl] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [savingFrame, setSavingFrame] = useState(false)

    const [toast, setToast] = useState<string | null>(null)

    const hasImage = !!imagePath
    const hasFrame = !!framePath

    // public bucket 기준: 경로 → 공개 URL로 변환
    useEffect(() => {
        if (!imagePath) {
            setImageUrl(null)
            return
        }
        const { data } = supabase.storage.from('profile-images').getPublicUrl(imagePath)
        // 캐시 무효화(같은 파일명 업서트 시)
        setImageUrl(`${data.publicUrl}?t=${Date.now()}`)
    }, [imagePath])

    function showToast(msg: string) {
        setToast(msg)
        setTimeout(() => setToast(null), 2500)
    }
    useEffect(() => {
        supabase.auth.getUser().then(({ data }) => {
            console.log('auth.uid =', data.user?.id)
            console.log('prop userId =', userId)
        })
    }, [userId])
    // -----------------------
    // 프레임 저장
    // -----------------------
    async function saveFrame(nextFramePath: string | null) {
        setSavingFrame(true)
        try {
            const res = await fetch('/api/profile/frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ framePath: nextFramePath }),
            })
            const data = await res.json().catch(() => ({}))

            if (!res.ok || !data.ok) {
                throw new Error(data.message ?? '프레임 저장에 실패했어요.')
            }

            setFramePath(nextFramePath)
            showToast('프레임이 저장됐어요 ✅')
        } catch (e: any) {
            showToast(e?.message ?? '프레임 저장 중 오류가 발생했어요.')
        } finally {
            setSavingFrame(false)
        }
    }

    // -----------------------
    // 이미지 업로드
    // -----------------------
    async function onPickImage(file: File) {
        setUploading(true)
        try {
            // 간단한 가드(원하면 더 엄격하게: 용량 제한 등)
            if (!file.type.startsWith('image/')) {
                throw new Error('이미지 파일만 업로드할 수 있어요.')
            }

            const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
            const objectPath = `${userId}/avatar-${Date.now()}.${ext}`

            const { error: upErr } = await supabase.storage
                .from('profile-images')
                .upload(objectPath, file, {
                    upsert: false,
                    contentType: file.type,
                })

            if (upErr) throw upErr

            // DB에 새 경로 저장
            const res = await fetch('/api/profile/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePath: objectPath }),
            })

            if (imagePath) {
                await supabase.storage.from('profile-images').remove([imagePath])
            }

            const data = await res.json().catch(() => ({}))

            if (!res.ok || !data.ok) {
                throw new Error(data.message ?? 'DB 저장에 실패했어요.')
            }

            setImagePath(objectPath)
            showToast('프로필 이미지가 저장됐어요 ✅')
        } catch (e: any) {
            showToast(e?.message ?? '이미지 업로드 중 오류가 발생했어요.')
        } finally {
            setUploading(false)
        }
    }

    // -----------------------
    // 이미지 제거 (선택)
    // -----------------------
    async function removeImage() {
        setUploading(true)
        try {
            // 1) DB null 처리 먼저
            const res = await fetch('/api/profile/image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imagePath: null }),
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.ok) {
                throw new Error(data.message ?? 'DB 저장에 실패했어요.')
            }

            // 2) 스토리지 파일 삭제는 선택이지만, 여기서는 같이 정리
            if (imagePath) {
                await supabase.storage.from('profile-images').remove([imagePath])
            }

            setImagePath(null)
            showToast('프로필 이미지가 제거됐어요 ✅')
        } catch (e: any) {
            showToast(e?.message ?? '이미지 제거 중 오류가 발생했어요.')
        } finally {
            setUploading(false)
        }
    }

    return (
        <div className="grid gap-6">
            {/* 미리보기 카드 */}
            <section className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-700/50 p-6 shadow-xl">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-lg font-bold text-slate-100">{member.member_name}</div>
                        <div className="mt-1 text-sm text-slate-300">{member.riot_id}</div>
                        <div className="mt-2 text-xs text-slate-400">
                            프로필은 선택 사항(이미지/프레임 각각 없어도 OK)
                        </div>
                    </div>

                    {/* 아바타 + 프레임 */}
                    <div className="relative h-24 w-24 shrink-0">
                        {/* 프로필 이미지 */}
                        <div
                            className="absolute inset-0 rounded-full overflow-hidden bg-slate-700/40 ring-2 ring-slate-600/60 z-10">
                            {imageUrl ? (
                                <Image src={imageUrl} alt="profile image" fill className="object-cover"/>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                                        <path
                                            d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z"
                                            stroke="currentColor"
                                            strokeWidth="1.7"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                            )}
                        </div>

                        {/* 프레임 오버레이 */}
                        {hasFrame && (
                            <div className="absolute -inset-9 sm:-inset-10 pointer-events-none z-20">
                                <Image
                                    src={framePath!}
                                    alt="profile frame"
                                    fill
                                    className="object-contain drop-shadow-[0_0_14px_rgba(0,0,0,0.45)]"
                                    priority
                                />
                            </div>
                        )}
                    </div>

                </div>

                {/* 토스트 */}
                {toast && (
                    <div
                        className="mt-4 rounded-2xl bg-slate-800/50 ring-1 ring-slate-700/50 px-4 py-3 text-sm text-slate-200">
                        {toast}
                    </div>
                )}
            </section>

            {/* 프로필 이미지 섹션 */}
            <section className="rounded-3xl bg-slate-900/30 ring-1 ring-slate-700/50 p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-slate-100 font-extrabold">프로필 이미지</div>
                        <div className="mt-1 text-xs text-slate-400">이미지는 자유롭게 업로드할 수 있어요.</div>
                    </div>

                    <button
                        disabled={uploading || !hasImage}
                        onClick={removeImage}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-700/60 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                    >
                    제거
                    </button>
                </div>

                <div className="mt-5 flex items-center gap-5">
                    <div className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-700/40 ring-2 ring-slate-600/60">
                        {imageUrl ? (
                            <Image src={imageUrl} alt="avatar preview" fill className="object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs">없음</div>
                        )}
                    </div>

                    <label className="inline-flex items-center gap-3">
                        <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={uploading}
                            onChange={(e) => {
                                const f = e.target.files?.[0]
                                if (f) onPickImage(f)
                                e.currentTarget.value = ''
                            }}
                        />
                        <span className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500/90 text-slate-900 hover:bg-amber-500 disabled:opacity-50 cursor-pointer">
              {uploading ? '업로드 중...' : '이미지 업로드'}
            </span>
                        <span className="text-xs text-slate-400">권장: 원형</span>
                    </label>
                </div>
            </section>

            {/* 프레임 선택 섹션 */}
            <section className="rounded-3xl bg-slate-900/30 ring-1 ring-slate-700/50 p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className="text-slate-100 font-extrabold">프레임 선택</div>
                        <div className="mt-1 text-xs text-slate-400">프레임은 프리셋 중에서 선택해요.</div>
                    </div>

                    <button
                        disabled={savingFrame}
                        onClick={() => saveFrame(null)}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-700/60 text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                    >
                        해제
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {FRAME_PRESETS.map((f) => {
                        const selected = framePath === f.path
                        return (
                            <button
                                key={f.key}
                                disabled={savingFrame}
                                onClick={() => saveFrame(f.path)}
                                className={[
                                    'rounded-2xl p-4 ring-1 transition',
                                    selected
                                        ? 'bg-amber-500/10 ring-amber-400/60'
                                        : 'bg-slate-800/40 ring-slate-700/50 hover:bg-slate-800/60',
                                    savingFrame ? 'opacity-50' : '',
                                ].join(' ')}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative w-12 h-12">
                                        <Image src={f.path} alt={f.label} fill className="object-contain" />
                                    </div>
                                    <div className="text-left">
                                        <div className="text-slate-100 font-bold">{f.label}</div>
                                        <div className="text-xs text-slate-400">{selected ? '선택됨' : '선택'}</div>
                                    </div>
                                </div>
                            </button>
                        )
                    })}
                </div>

                {savingFrame && <div className="mt-4 text-xs text-slate-400">저장 중...</div>}
            </section>
        </div>
    )
}
