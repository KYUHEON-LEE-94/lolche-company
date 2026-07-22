'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MemberStatus } from '@/types/supabase'
import {
    MEMBER_NAME_MAX,
    RIOT_GAME_NAME_MAX,
    RIOT_TAGLINE_MAX,
} from '@/lib/members/memberInput'

type Props = {
    initial: {
        member_name: string
        riot_game_name: string
        riot_tagline: string
    } | null
    status: MemberStatus | null
    rejectedReason: string | null
}

const inputCls =
    'w-full px-4 py-3 rounded-xl text-sm font-medium text-white bg-white/[0.04] border border-white/[0.08] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5 transition-all'

const STATUS_BADGE: Record<MemberStatus, { label: string; cls: string }> = {
    pending: { label: '승인 대기 중', cls: 'bg-amber-500/10 text-amber-300 ring-amber-500/30' },
    approved: { label: '승인 완료', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' },
    rejected: { label: '거절됨', cls: 'bg-red-500/10 text-red-300 ring-red-500/30' },
}

export default function MemberSelfForm({ initial, status, rejectedReason }: Props) {
    const router = useRouter()

    const [memberName, setMemberName] = useState(initial?.member_name ?? '')
    const [riotGameName, setRiotGameName] = useState(initial?.riot_game_name ?? '')
    const [riotTagline, setRiotTagline] = useState(initial?.riot_tagline ?? '')

    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    const isApproved = status === 'approved'

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setMessage(null)
        setError(null)

        try {
            const res = await fetch('/api/me/member', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    member_name: memberName,
                    riot_game_name: riotGameName,
                    riot_tagline: riotTagline,
                }),
            })
            const body = await res.json().catch(() => ({}))
            if (!res.ok || !body.ok) {
                throw new Error(body.message ?? '신청에 실패했습니다.')
            }

            setMessage(body.message ?? '신청이 접수되었습니다.')
            router.refresh()
        } catch (e) {
            setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <section className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-700/50 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-100">
                        {initial ? '내 라이엇 계정' : '멤버 등록 신청'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        {initial
                            ? '라이엇 ID를 바꾸면 관리자 재승인이 필요해요.'
                            : '단톡방 아이디와 라이엇 ID를 입력하면 관리자 승인 후 랭킹에 등록돼요.'}
                    </p>
                </div>
                {status && (
                    <span
                        className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-black ring-1 ${STATUS_BADGE[status].cls}`}
                    >
                        {STATUS_BADGE[status].label}
                    </span>
                )}
            </div>

            {status === 'pending' && (
                <div className="mt-4 rounded-2xl bg-amber-500/5 ring-1 ring-amber-500/20 p-4 text-sm text-amber-200/90">
                    관리자 승인 전에는 랭킹에 표시되지 않아요. 승인되면 자동으로 전적이 동기화됩니다.
                </div>
            )}

            {status === 'rejected' && (
                <div className="mt-4 rounded-2xl bg-red-500/5 ring-1 ring-red-500/20 p-4 text-sm text-red-200/90">
                    <div className="font-bold">신청이 거절되었습니다.</div>
                    {rejectedReason && <div className="mt-1">사유: {rejectedReason}</div>}
                    <div className="mt-1 text-red-200/70">정보를 수정하고 다시 신청할 수 있어요.</div>
                </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-400 tracking-widest uppercase">
                        단톡방 아이디
                    </label>
                    <input
                        type="text"
                        value={memberName}
                        onChange={(e) => setMemberName(e.target.value)}
                        maxLength={MEMBER_NAME_MAX}
                        className={inputCls}
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-400 tracking-widest uppercase">
                        라이엇 게임명
                    </label>
                    <input
                        type="text"
                        value={riotGameName}
                        onChange={(e) => setRiotGameName(e.target.value)}
                        maxLength={RIOT_GAME_NAME_MAX}
                        className={inputCls}
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="block text-xs font-black text-slate-400 tracking-widest uppercase">
                        태그라인
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-slate-500 font-bold">#</span>
                        <input
                            type="text"
                            value={riotTagline}
                            onChange={(e) => setRiotTagline(e.target.value)}
                            maxLength={RIOT_TAGLINE_MAX}
                            className={inputCls}
                            placeholder="KR1"
                            required
                        />
                    </div>
                    <p className="text-[11px] text-slate-600">영문/숫자 2~10자</p>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                >
                    {loading ? '처리 중...' : initial ? '정보 수정 신청' : '등록 신청하기'}
                </button>

                {isApproved && (
                    <p className="text-[11px] text-slate-500 text-center">
                        라이엇 ID를 변경하면 승인 대기 상태로 돌아가고 랭킹에서 일시적으로 제외됩니다.
                    </p>
                )}
            </form>

            {message && (
                <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 text-emerald-300 text-xs font-bold">
                    {message}
                </div>
            )}
            {error && (
                <div className="mt-4 p-4 rounded-xl bg-red-500/10 ring-1 ring-red-500/20 text-red-300 text-xs font-bold">
                    {error}
                </div>
            )}
        </section>
    )
}
