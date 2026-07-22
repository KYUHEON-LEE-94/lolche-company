'use client'

import { FormEvent, useState, useEffect, useCallback, useMemo } from 'react'
import type { MemberStatus } from '@/types/supabase'
import {
  MEMBER_NAME_MAX,
  RIOT_GAME_NAME_MAX,
  RIOT_TAGLINE_MAX,
  REJECTED_REASON_MAX,
} from '@/lib/members/memberInput'

function Field({
                 label, hint, children,
               }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
      <div className="space-y-1.5">
        <label className="block text-xs font-black text-slate-400 tracking-widest uppercase">
          {label}
        </label>
        {children}
        {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
      </div>
  )
}

const inputCls = `
  w-full px-4 py-3 rounded-xl text-sm font-medium text-white
  bg-white/[0.04] border border-white/[0.08]
  placeholder:text-slate-600
  focus:outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5
  transition-all duration-200
`

type MemberListItem = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
  status: MemberStatus
  rejected_reason: string | null
  requested_at: string | null
  approved_at: string | null
  created_at: string
  last_synced_at: string | null
  login_linked: boolean
  discord_registered: boolean
}

type Tab = 'pending' | 'all'

const STATUS_BADGE: Record<MemberStatus, { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30' },
  approved: { label: '승인', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' },
  rejected: { label: '거절', cls: 'bg-red-500/10 text-red-300 border-red-500/30' },
}

const DELETE_WARNING = [
  '랭크 히스토리 그래프',
  '내전 참가·팀·결과 기록',
  '해당 멤버의 매치 참가 데이터',
]

export default function AdminMemberControlPage() {
  const [members, setMembers] = useState<MemberListItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [tab, setTab] = useState<Tab>('pending')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [memberName, setMemberName] = useState('')
  const [riotGameName, setRiotGameName] = useState('')
  const [riotTagline, setRiotTagline] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<MemberListItem | null>(null)
  const [confirmName, setConfirmName] = useState('')

  const loadMembers = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/members')
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '목록을 불러오지 못했습니다.')
      setMembers(body.members as MemberListItem[])
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    }
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  const resetForm = () => {
    setEditingId(null)
    setMemberName('')
    setRiotGameName('')
    setRiotTagline('')
  }

  const handleEditStart = (m: MemberListItem) => {
    setEditingId(m.id)
    setMemberName(m.member_name)
    setRiotGameName(m.riot_game_name)
    setRiotTagline(m.riot_tagline)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const runAction = async (id: string, fn: () => Promise<Response>, successMsg: string) => {
    setBusyId(id)
    setMessage(null)
    setError(null)
    try {
      const res = await fn()
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '작업에 실패했습니다.')
      setMessage(body.message ?? successMsg)
      await loadMembers()
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업에 실패했습니다.')
      return false
    } finally {
      setBusyId(null)
    }
  }

  const handleApprove = (m: MemberListItem) =>
      runAction(
          m.id,
          () => fetch(`/api/admin/members/${m.id}/approve`, { method: 'POST' }),
          '승인했습니다.',
      )

  const handleReject = (m: MemberListItem) => {
    const reason = window.prompt(`"${m.member_name}" 신청을 거절합니다. 사유를 입력해주세요.`, '')
    if (reason === null) return
    if (reason.length > REJECTED_REASON_MAX) {
      setError(`거절 사유는 ${REJECTED_REASON_MAX}자 이하여야 합니다.`)
      return
    }
    return runAction(
        m.id,
        () =>
            fetch(`/api/admin/members/${m.id}/reject`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason }),
            }),
        '거절했습니다.',
    )
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    const target = deleteTarget
    const success = await runAction(
        target.id,
        () =>
            fetch(`/api/admin/members/${target.id}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ confirmName }),
            }),
        '삭제했습니다.',
    )
    if (success) {
      if (editingId === target.id) resetForm()
      setDeleteTarget(null)
      setConfirmName('')
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const endpoint = editingId ? `/api/admin/members/update` : `/api/admin/members/create`
      const payload = editingId
          ? { id: editingId, member_name: memberName, riot_game_name: riotGameName, riot_tagline: riotTagline }
          : { member_name: memberName, riot_game_name: riotGameName, riot_tagline: riotTagline }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) throw new Error(body.message ?? '작업에 실패했습니다.')

      // Riot ID가 바뀌었을 수 있으므로 동기화 시도 (실패해도 등록/수정은 유효)
      const targetId = editingId || body.memberId
      await fetch(`/api/members/${targetId}/sync`, { method: 'POST' }).catch(() => null)

      setMessage(editingId ? '정보가 수정되었습니다.' : '멤버가 등록되었습니다.')
      resetForm()
      await loadMembers()
    } catch (e) {
      setError(e instanceof Error ? e.message : '작업에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const pendingCount = useMemo(() => members.filter((m) => m.status === 'pending').length, [members])

  const visibleMembers = useMemo(() => {
    const base = tab === 'pending' ? members.filter((m) => m.status === 'pending') : members
    const term = searchTerm.trim()
    if (!term) return base
    return base.filter((m) => m.member_name.includes(term) || m.riot_game_name.includes(term))
  }, [members, tab, searchTerm])

  return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ── 좌측: 등록/수정 폼 ── */}
        <div className="lg:col-span-4 space-y-6">
          <div className="sticky top-24">
            <div className="mb-6">
              <h1 className="text-2xl font-black text-white tracking-tight mb-1">
                {editingId ? '멤버 정보 수정' : '새 멤버 등록'}
              </h1>
              <p className="text-sm text-slate-500">
                {editingId ? '기존 멤버의 라이엇 계정 정보를 변경합니다' : '관리자가 등록한 멤버는 즉시 승인 상태가 됩니다'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-5">
              <Field label="단톡방 아이디">
                <input type="text" value={memberName} maxLength={MEMBER_NAME_MAX}
                       onChange={(e) => setMemberName(e.target.value)} className={inputCls} required />
              </Field>
              <Field label="라이엇 게임명">
                <input type="text" value={riotGameName} maxLength={RIOT_GAME_NAME_MAX}
                       onChange={(e) => setRiotGameName(e.target.value)} className={inputCls} required />
              </Field>
              <Field label="태그라인" hint="영문/숫자 2~10자">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-bold">#</span>
                  <input type="text" value={riotTagline} maxLength={RIOT_TAGLINE_MAX}
                         onChange={(e) => setRiotTagline(e.target.value)} className={inputCls} required />
                </div>
              </Field>

              <div className="pt-2 flex flex-col gap-2">
                <button type="submit" disabled={loading} className="w-full py-3 rounded-xl text-sm font-black text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all">
                  {loading ? '처리 중...' : editingId ? '정보 수정하기' : '멤버 등록하기'}
                </button>
                {editingId && (
                    <button type="button" onClick={resetForm} className="w-full py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white transition-colors">
                      취소하고 새로 등록하기
                    </button>
                )}
              </div>
            </form>

            {message && <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">{message}</div>}
            {error && <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">{error}</div>}
          </div>
        </div>

        {/* ── 우측: 탭 + 목록 ── */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex gap-2">
              <button
                  onClick={() => setTab('pending')}
                  className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${
                      tab === 'pending'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
              >
                대기 중 ({pendingCount})
              </button>
              <button
                  onClick={() => setTab('all')}
                  className={`px-4 py-2 rounded-xl text-sm font-black transition-all ${
                      tab === 'all'
                          ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30'
                          : 'text-slate-500 hover:text-slate-300 border border-transparent'
                  }`}
              >
                전체 멤버 ({members.length})
              </button>
            </div>

            <div className="relative">
              <input
                  type="text"
                  placeholder="멤버 이름 검색..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`${inputCls} !py-2 !pl-10 !w-64`}
              />
              <svg className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>

          <div className="grid gap-3">
            {visibleMembers.map((m) => (
                <div key={m.id}
                     className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all">

                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-500 uppercase">
                      {m.member_name[0]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-white font-bold truncate">{m.member_name}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${STATUS_BADGE[m.status].cls}`}>
                          {STATUS_BADGE[m.status].label}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                            m.login_linked
                                ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                                : 'bg-slate-700/30 text-slate-500 border-slate-600/30'
                        }`}>
                          {m.login_linked ? '로그인 연결됨' : '미로그인'}
                        </span>
                        {!m.login_linked && m.discord_registered && (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-black border bg-violet-500/10 text-violet-300 border-violet-500/30">
                              Discord 사전등록
                            </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {m.riot_game_name} <span className="text-slate-700">#{m.riot_tagline}</span>
                      </div>
                      {m.status === 'rejected' && m.rejected_reason && (
                          <div className="text-[11px] text-red-400/80 mt-0.5 truncate">거절 사유: {m.rejected_reason}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {m.status !== 'approved' && (
                        <button
                            onClick={() => handleApprove(m)}
                            disabled={busyId === m.id}
                            className="px-4 py-2 rounded-lg text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white disabled:opacity-50 transition-all"
                        >
                          승인
                        </button>
                    )}
                    {m.status !== 'rejected' && (
                        <button
                            onClick={() => handleReject(m)}
                            disabled={busyId === m.id}
                            className="px-4 py-2 rounded-lg text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500 hover:text-white disabled:opacity-50 transition-all"
                        >
                          거절
                        </button>
                    )}
                    <button
                        onClick={() => handleEditStart(m)}
                        className="px-4 py-2 rounded-lg text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white transition-all"
                    >
                      수정
                    </button>
                    <button
                        onClick={() => { setDeleteTarget(m); setConfirmName('') }}
                        disabled={busyId === m.id}
                        className="px-4 py-2 rounded-lg text-xs font-bold text-red-400 bg-red-500/10 hover:bg-red-500 hover:text-white disabled:opacity-50 transition-all"
                    >
                      추방
                    </button>
                  </div>
                </div>
            ))}
            {visibleMembers.length === 0 && (
                <div className="text-center py-20 text-slate-600 border-2 border-dashed border-white/5 rounded-3xl">
                  {tab === 'pending' ? '대기 중인 신청이 없습니다.' : '검색 결과가 없습니다.'}
                </div>
            )}
          </div>
        </div>

        {/* ── 추방 확인 모달 ── */}
        {deleteTarget && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
              <div className="w-full max-w-md rounded-2xl bg-[#0d1117] border border-red-500/30 p-6">
                <h3 className="text-lg font-black text-white">멤버 추방</h3>
                <p className="mt-2 text-sm text-slate-400">
                  <span className="font-bold text-white">{deleteTarget.member_name}</span> 멤버를 완전히 삭제합니다.
                  이 작업은 <span className="text-red-400 font-bold">되돌릴 수 없습니다.</span>
                </p>

                <div className="mt-4 rounded-xl bg-red-500/5 border border-red-500/20 p-4">
                  <div className="text-xs font-black text-red-300 uppercase tracking-widest">함께 삭제되는 데이터</div>
                  <ul className="mt-2 text-xs text-red-200/80 list-disc pl-5 space-y-1">
                    {DELETE_WARNING.map((w) => <li key={w}>{w}</li>)}
                  </ul>
                  <div className="mt-3 text-[11px] text-slate-400">
                    명예의 전당 시즌 기록은 이름 스냅샷으로 보존됩니다.
                  </div>
                </div>

                <div className="mt-5 space-y-1.5">
                  <label className="block text-xs font-black text-slate-400 tracking-widest uppercase">
                    확인을 위해 멤버명을 입력하세요
                  </label>
                  <input
                      type="text"
                      value={confirmName}
                      onChange={(e) => setConfirmName(e.target.value)}
                      placeholder={deleteTarget.member_name}
                      className={inputCls}
                  />
                </div>

                <div className="mt-5 flex gap-2">
                  <button
                      onClick={() => { setDeleteTarget(null); setConfirmName('') }}
                      className="flex-1 py-3 rounded-xl text-sm font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-all"
                  >
                    취소
                  </button>
                  <button
                      onClick={handleDeleteConfirm}
                      disabled={confirmName !== deleteTarget.member_name || busyId === deleteTarget.id}
                      className="flex-1 py-3 rounded-xl text-sm font-black text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {busyId === deleteTarget.id ? '삭제 중...' : '영구 삭제'}
                  </button>
                </div>
              </div>
            </div>
        )}

      </div>
  )
}
