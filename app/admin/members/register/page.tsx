'use client'

import { FormEvent, useState, useEffect, useCallback } from 'react'
import { supabaseClient } from '@/lib/supabase'

function Spinner() {
  return (
      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
  )
}

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

export default function AdminMemberRegisterPage() {
  const [members, setMembers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')

  // 폼 상태 (등록/수정 공용)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [memberName, setMemberName] = useState('')
  const [riotGameName, setRiotGameName] = useState('')
  const [riotTagline, setRiotTagline] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

// 멤버 목록 불러오기
  const loadMembers = useCallback(async () => {
    const { data } = await supabaseClient
        .from('members')
        .select('*')
        .order('created_at', { ascending: false })
    if (data) setMembers(data)
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  // 등록/수정 모드 전환 및 초기화
  const resetForm = () => {
    setEditingId(null)
    setMemberName('')
    setRiotGameName('')
    setRiotTagline('')
  }

  // 수정 버튼 클릭 시
  const handleEditStart = (m: any) => {
    setEditingId(m.id)
    setMemberName(m.member_name)
    setRiotGameName(m.riot_game_name)
    setRiotTagline(m.riot_tagline)
    window.scrollTo({ top: 0, behavior: 'smooth' })
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

      const body = await res.json()
      if (!res.ok || !body.ok) throw new Error(body.message ?? '작업에 실패했습니다.')

      // 동기화 시도 (Riot ID가 바뀌었을 수 있으므로)
      const targetId = editingId || body.memberId
      await fetch(`/api/members/${targetId}/sync`, { method: 'POST' })

      setMessage(editingId ? '정보가 수정되었습니다.' : '멤버가 등록되었습니다.')
      resetForm()
      await loadMembers()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredMembers = members.filter(m =>
      m.member_name.includes(searchTerm) || m.riot_game_name.includes(searchTerm)
  )

  return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ── 좌측: 등록/수정 폼 (4컬럼) ── */}
        <div className="lg:col-span-4 space-y-6">
          <div className="sticky top-24">
            <div className="mb-6">
              <h1 className="text-2xl font-black text-white tracking-tight mb-1">
                {editingId ? '멤버 정보 수정' : '새 멤버 등록'}
              </h1>
              <p className="text-sm text-slate-500">
                {editingId ? '기존 멤버의 라이엇 계정 정보를 변경합니다' : '새 멤버를 등록하고 데이터를 연동합니다'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-5">
              <Field label="단톡방 아이디">
                <input type="text" value={memberName} onChange={(e) => setMemberName(e.target.value)} className={inputCls} required />
              </Field>
              <Field label="라이엇 게임명">
                <input type="text" value={riotGameName} onChange={(e) => setRiotGameName(e.target.value)} className={inputCls} required />
              </Field>
              <Field label="태그라인">
                <div className="flex items-center gap-2">
                  <span className="text-slate-500 font-bold">#</span>
                  <input type="text" value={riotTagline} onChange={(e) => setRiotTagline(e.target.value)} className={inputCls} required />
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

            {message && <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold animate-in fade-in">{message}</div>}
            {error && <div className="mt-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold animate-in fade-in">{error}</div>}
          </div>
        </div>

        {/* ── 우측: 검색 및 목록 (8컬럼) ── */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-xl font-black text-white">등록된 멤버 ({members.length})</h2>
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
            {filteredMembers.map((m) => (
                <div key={m.id} className="group flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:border-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-400">
                      {m.member_name[0]}
                    </div>
                    <div>
                      <div className="text-white font-bold">{m.member_name}</div>
                      <div className="text-xs text-slate-500">
                        {m.riot_game_name} <span className="text-slate-700">#{m.riot_tagline}</span>
                      </div>
                    </div>
                  </div>
                  <button
                      onClick={() => handleEditStart(m)}
                      className="px-4 py-2 rounded-lg text-xs font-bold text-indigo-400 bg-indigo-500/10 hover:bg-indigo-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                  >
                    정보 수정
                  </button>
                </div>
            ))}
            {filteredMembers.length === 0 && (
                <div className="text-center py-20 text-slate-600 border-2 border-dashed border-white/5 rounded-3xl">
                  검색 결과가 없습니다.
                </div>
            )}
          </div>
        </div>

      </div>
  )
}