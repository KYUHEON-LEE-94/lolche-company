'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MemberStatus } from '@/types/supabase'
import {
    MAX_RIOT_ACCOUNTS,
    MEMBER_NAME_MAX,
    RIOT_GAME_NAME_MAX,
    RIOT_TAGLINE_MAX,
} from '@/lib/members/memberInput'

export type RiotAccountView = {
    id: string
    account_no: number
    is_primary: boolean
    riot_game_name: string
    riot_tagline: string
}

type Props = {
    initial: {
        member_name: string
        riot_game_name: string
        riot_tagline: string
    } | null
    status: MemberStatus | null
    rejectedReason: string | null
    /** 대표 계정이 항상 첫 번째. 마이그레이션 미적용이면 빈 배열 */
    accounts: RiotAccountView[]
    migrationRequired: boolean
}

const inputCls =
    'w-full px-4 py-3 rounded-xl text-sm font-medium text-white bg-white/[0.04] border border-white/[0.08] placeholder:text-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5 transition-all'

const STATUS_BADGE: Record<MemberStatus, { label: string; cls: string }> = {
    pending: { label: '승인 대기 중', cls: 'bg-amber-500/10 text-amber-300 ring-amber-500/30' },
    approved: { label: '승인 완료', cls: 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' },
    rejected: { label: '거절됨', cls: 'bg-red-500/10 text-red-300 ring-red-500/30' },
}

export default function MemberSelfForm({
    initial,
    status,
    rejectedReason,
    accounts,
    migrationRequired,
}: Props) {
    const router = useRouter()

    const [memberName, setMemberName] = useState(initial?.member_name ?? '')
    const [riotGameName, setRiotGameName] = useState(initial?.riot_game_name ?? '')
    const [riotTagline, setRiotTagline] = useState(initial?.riot_tagline ?? '')

    const [loading, setLoading] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    // 계정 편집 상태
    const [busyId, setBusyId] = useState<string | null>(null)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editTag, setEditTag] = useState('')
    const [addName, setAddName] = useState('')
    const [addTag, setAddTag] = useState('')
    const [addOpen, setAddOpen] = useState(false)

    const isApproved = status === 'approved'
    const canAdd = accounts.length > 0 && accounts.length < MAX_RIOT_ACCOUNTS
    const isLastAccount = accounts.length <= 1

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

    const runAccountAction = async (key: string, request: () => Promise<Response>) => {
        setBusyId(key)
        setMessage(null)
        setError(null)
        try {
            const res = await request()
            const body = await res.json().catch(() => ({}))
            if (!res.ok || !body.ok) throw new Error(body.message ?? '작업에 실패했습니다.')
            setMessage(body.message ?? '변경되었습니다.')
            router.refresh()
            return true
        } catch (e) {
            setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
            return false
        } finally {
            setBusyId(null)
        }
    }

    const handleAdd = async (e: FormEvent) => {
        e.preventDefault()
        const ok = await runAccountAction('add', () =>
            fetch('/api/me/riot-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ riot_game_name: addName, riot_tagline: addTag }),
            }),
        )
        if (ok) {
            setAddName('')
            setAddTag('')
            setAddOpen(false)
        }
    }

    const handleEditSave = async (e: FormEvent, accountId: string) => {
        e.preventDefault()
        const ok = await runAccountAction(accountId, () =>
            fetch(`/api/me/riot-accounts/${accountId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ riot_game_name: editName, riot_tagline: editTag }),
            }),
        )
        if (ok) setEditingId(null)
    }

    const handleDelete = (account: RiotAccountView) => {
        if (!window.confirm(`${account.riot_game_name}#${account.riot_tagline} 계정을 삭제할까요?`)) return
        return runAccountAction(account.id, () =>
            fetch(`/api/me/riot-accounts/${account.id}`, { method: 'DELETE' }),
        )
    }

    const handleSetPrimary = (account: RiotAccountView) =>
        runAccountAction(account.id, () =>
            fetch(`/api/me/riot-accounts/${account.id}/primary`, { method: 'POST' }),
        )

    return (
        <section className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-700/50 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-lg font-extrabold text-slate-100">
                        {initial ? '내 라이엇 계정' : '멤버 등록 신청'}
                    </h2>
                    <p className="mt-1 text-sm text-slate-400">
                        {initial
                            ? `라이엇 계정은 최대 ${MAX_RIOT_ACCOUNTS}개까지 등록할 수 있고, 랭킹에는 대표 계정만 표시돼요.`
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

            {initial && migrationRequired && (
                <div className="mt-4 rounded-2xl bg-slate-500/5 ring-1 ring-slate-500/20 p-4 text-sm text-slate-300">
                    다중 라이엇 계정 기능이 아직 활성화되지 않았습니다. 아래 폼으로 대표 계정만 수정할 수 있어요.
                </div>
            )}

            {/* ── 등록된 라이엇 계정 목록 ── */}
            {initial && accounts.length > 0 && (
                <div className="mt-6">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black text-slate-400 tracking-widest uppercase">
                            등록된 계정 ({accounts.length}/{MAX_RIOT_ACCOUNTS})
                        </h3>
                        {canAdd && !addOpen && (
                            <button
                                type="button"
                                onClick={() => setAddOpen(true)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white transition-all"
                            >
                                계정 추가
                            </button>
                        )}
                    </div>

                    <ul className="mt-3 space-y-2">
                        {accounts.map((a) => (
                            <li
                                key={a.id}
                                className="rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4"
                            >
                                {editingId === a.id ? (
                                    <form onSubmit={(e) => handleEditSave(e, a.id)} className="space-y-3">
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            maxLength={RIOT_GAME_NAME_MAX}
                                            className={inputCls}
                                            required
                                        />
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-500 font-bold">#</span>
                                            <input
                                                type="text"
                                                value={editTag}
                                                onChange={(e) => setEditTag(e.target.value)}
                                                maxLength={RIOT_TAGLINE_MAX}
                                                className={inputCls}
                                                required
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="submit"
                                                disabled={busyId === a.id}
                                                className="flex-1 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                                            >
                                                {busyId === a.id ? '저장 중...' : '저장'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingId(null)}
                                                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all"
                                            >
                                                취소
                                            </button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                {a.is_primary && (
                                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
                                                        대표
                                                    </span>
                                                )}
                                                <span className="text-sm font-bold text-slate-100 truncate">
                                                    {a.riot_game_name}
                                                    <span className="text-slate-500">#{a.riot_tagline}</span>
                                                </span>
                                            </div>
                                            {a.is_primary && (
                                                <p className="mt-1 text-[11px] text-slate-500">
                                                    이 계정의 랭크가 공개 랭킹에 표시돼요.
                                                </p>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {!a.is_primary && (
                                                <button
                                                    type="button"
                                                    onClick={() => handleSetPrimary(a)}
                                                    disabled={busyId === a.id}
                                                    className="px-3 py-2 rounded-lg text-xs font-bold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white disabled:opacity-50 transition-all"
                                                >
                                                    대표 지정
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditingId(a.id)
                                                    setEditName(a.riot_game_name)
                                                    setEditTag(a.riot_tagline)
                                                }}
                                                className="px-3 py-2 rounded-lg text-xs font-bold text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white transition-all"
                                            >
                                                수정
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(a)}
                                                disabled={busyId === a.id || isLastAccount}
                                                title={
                                                    isLastAccount
                                                        ? '마지막 라이엇 계정은 삭제할 수 없어요.'
                                                        : undefined
                                                }
                                                className="px-3 py-2 rounded-lg text-xs font-bold text-red-300 bg-red-500/10 hover:bg-red-500 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            >
                                                삭제
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>

                    {isLastAccount && (
                        <p className="mt-2 text-[11px] text-slate-500">
                            마지막 라이엇 계정은 삭제할 수 없어요. 계정을 바꾸려면 &lsquo;수정&rsquo;을 이용하세요.
                        </p>
                    )}

                    {addOpen && (
                        <form
                            onSubmit={handleAdd}
                            className="mt-3 rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.06] p-4 space-y-3"
                        >
                            <div className="text-xs font-black text-slate-400 tracking-widest uppercase">
                                계정 추가
                            </div>
                            <input
                                type="text"
                                value={addName}
                                onChange={(e) => setAddName(e.target.value)}
                                maxLength={RIOT_GAME_NAME_MAX}
                                placeholder="라이엇 게임명"
                                className={inputCls}
                                required
                            />
                            <div className="flex items-center gap-2">
                                <span className="text-slate-500 font-bold">#</span>
                                <input
                                    type="text"
                                    value={addTag}
                                    onChange={(e) => setAddTag(e.target.value)}
                                    maxLength={RIOT_TAGLINE_MAX}
                                    placeholder="KR1"
                                    className={inputCls}
                                    required
                                />
                            </div>
                            <p className="text-[11px] text-slate-500">
                                추가한 계정은 대표로 지정하기 전까지 랭킹에 표시되지 않아요.
                            </p>
                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={busyId === 'add'}
                                    className="flex-1 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                                >
                                    {busyId === 'add' ? '추가 중...' : '추가하기'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAddOpen(false)}
                                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all"
                                >
                                    취소
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {initial && accounts.length > 0 && (
                    <div className="text-xs font-black text-slate-400 tracking-widest uppercase">
                        단톡방 아이디 · 대표 계정
                    </div>
                )}

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

                {!initial && (
                    <p className="text-[11px] text-slate-500">
                        이미 등록된 멤버라면 기존과 같은 라이엇 ID를 입력하세요. 기존 랭킹·전적 기록에 그대로 연결됩니다.
                    </p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 transition-all"
                >
                    {loading ? '처리 중...' : initial ? '정보 수정 신청' : '등록 신청하기'}
                </button>

                {isApproved && (
                    <p className="text-[11px] text-slate-500 text-center">
                        대표 계정의 라이엇 ID를 변경하면 승인 대기 상태로 돌아가고 랭킹에서 일시적으로 제외됩니다.
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
