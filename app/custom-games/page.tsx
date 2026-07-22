'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabaseClient } from '@/lib/supabase'
import { Spinner } from '@/app/components/Spinner'
import Link from 'next/link'

type GameRow = {
  id: string
  title: string
  status: string
  game_type: string
  max_rounds: number
  created_at: string
  ended_at: string | null
}

type MemberOption = {
  id: string
  member_name: string
  riot_game_name: string
  riot_tagline: string
}

type GuestInput = {
  display_name: string
  riot_game_name: string
  riot_tagline: string
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  in_progress: {
    bg: 'bg-emerald-500/10 border border-emerald-500/20',
    text: 'text-emerald-400',
    label: '진행중',
  },
  ended: {
    bg: 'bg-slate-500/10 border border-slate-500/20',
    text: 'text-slate-400',
    label: '종료',
  },
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_BADGE[status] ?? STATUS_BADGE.ended
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold ${s.bg} ${s.text}`}>
      {s.label}
    </span>
  )
}

export default function CustomGamesPage() {
  const router = useRouter()
  const [games, setGames] = useState<GameRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [showModal, setShowModal] = useState(false)
  const [members, setMembers] = useState<MemberOption[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [titleInput, setTitleInput] = useState('')
  const [maxRounds, setMaxRounds] = useState(5)
  const [gameType, setGameType] = useState<'solo' | 'team'>('solo')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 게스트 입력 상태
  const [guestInputs, setGuestInputs] = useState<GuestInput[]>([])
  const [showGuestForm, setShowGuestForm] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [guestRiotId, setGuestRiotId] = useState('')

  const showMsg = (type: 'error' | 'success', msg: string) => {
    if (type === 'error') { setError(msg); setSuccessMsg(null) }
    else { setSuccessMsg(msg); setError(null) }
    setTimeout(() => { setError(null); setSuccessMsg(null) }, 4000)
  }

  const loadGames = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/custom-games')
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '목록 로드 실패'); return }
      setGames(body.games ?? [])
    } catch { showMsg('error', '알 수 없는 오류가 발생했습니다') }
    finally { setLoading(false) }
  }, [])

  const loadMembers = useCallback(async () => {
    const { data } = await supabaseClient
      .from('members')
      .select('id, member_name, riot_game_name, riot_tagline')
      .eq('status', 'approved')
      .order('member_name')
    setMembers((data ?? []) as MemberOption[])
  }, [])

  useEffect(() => { loadGames(); loadMembers() }, [loadGames, loadMembers])

  const handleOpenModal = () => {
    setTitleInput('')
    setSelectedIds(new Set())
    setMaxRounds(5)
    setGameType('solo')
    setGuestInputs([])
    setShowGuestForm(false)
    setGuestName('')
    setGuestRiotId('')
    setShowModal(true)
  }

  const toggleMember = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const totalSelected = selectedIds.size + guestInputs.length

  const handleAddGuestToList = () => {
    if (!guestName.trim()) return
    const parts = guestRiotId.trim().split('#')
    if (parts.length !== 2 || !parts[0] || !parts[1]) return
    if (totalSelected >= 8) return
    setGuestInputs((prev) => [...prev, {
      display_name: guestName.trim(),
      riot_game_name: parts[0].trim(),
      riot_tagline: parts[1].trim(),
    }])
    setGuestName('')
    setGuestRiotId('')
    setShowGuestForm(false)
  }

  const handleRemoveGuest = (idx: number) => {
    setGuestInputs((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleCreate = async () => {
    if (!titleInput.trim()) { showMsg('error', '제목을 입력하세요'); return }
    if (gameType === 'team' && totalSelected !== 8) {
      showMsg('error', '팀전은 정확히 8명을 선택해야 합니다'); return
    }
    if (totalSelected < 2) { showMsg('error', '참가자를 2명 이상 선택하세요'); return }
    setCreating(true)
    try {
      const res = await fetch('/api/custom-games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: titleInput.trim(),
          participant_ids: [...selectedIds],
          max_rounds: maxRounds,
          game_type: gameType,
          guests: guestInputs,
        }),
      })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '생성 실패'); return }
      setShowModal(false)
      router.push(`/custom-games/${body.id}`)
    } catch { showMsg('error', '생성 중 오류가 발생했습니다') }
    finally { setCreating(false) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('이 내전을 삭제하시겠습니까? 모든 라운드 기록이 함께 삭제됩니다.')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/custom-games/${id}`, { method: 'DELETE' })
      const body = await res.json()
      if (!res.ok) { showMsg('error', body.error ?? '삭제 실패'); return }
      showMsg('success', '삭제되었습니다')
      await loadGames()
    } catch { showMsg('error', '삭제 중 오류가 발생했습니다') }
    finally { setDeletingId(null) }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#07090f' }}>
      {/* 배경 글로우 */}
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{ background: 'radial-gradient(ellipse 70% 40% at 50% -5%, rgba(99,102,241,0.12) 0%, transparent 70%)' }}
      />

      {/* 헤더 */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{ background: 'rgba(7,9,15,0.85)', backdropFilter: 'blur(16px)', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                <path d="M15 19l-7-7 7-7" />
              </svg>
              홈
            </Link>
            <span className="text-slate-700">·</span>
            <span className="text-sm font-black text-white">내전</span>
          </div>
          <button
            type="button"
            onClick={handleOpenModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl
              text-sm font-bold transition-all duration-200
              bg-indigo-500/10 border border-indigo-500/30 text-indigo-400
              hover:bg-indigo-500/20 hover:text-indigo-300"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 4v16m8-8H4" />
            </svg>
            새 내전
          </button>
        </div>
      </header>

      {/* 메인 */}
      <main className="relative z-10 flex-1 max-w-5xl mx-auto w-full px-6 py-8">
        <div
          className="rounded-2xl border p-8"
          style={{ background: 'rgba(13,17,23,0.9)', borderColor: 'rgba(255,255,255,0.07)', backdropFilter: 'blur(8px)' }}
        >
          <div className="mb-8">
            <h1 className="text-2xl font-black text-white tracking-tight mb-1">내전</h1>
            <p className="text-sm text-slate-500">TFT 내전을 만들고 결과를 기록합니다</p>
          </div>

          {/* 알림 배너 */}
          {error && (
            <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}
          {successMsg && (
            <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-medium">
              <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              {successMsg}
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-500">
              <Spinner size={6} />
              <p className="text-sm font-semibold">로딩 중...</p>
            </div>
          )}

          {!loading && games.length === 0 && (
            <div
              className="flex flex-col items-center justify-center py-20 border border-dashed rounded-2xl"
              style={{ borderColor: 'rgba(255,255,255,0.07)' }}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'rgba(255,255,255,0.04)' }}>
                <svg className="w-6 h-6 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <p className="text-slate-400 font-bold mb-1">진행 중인 내전이 없습니다</p>
              <p className="text-slate-600 text-sm">오른쪽 위 [새 내전] 버튼으로 시작하세요</p>
            </div>
          )}

          {!loading && games.length > 0 && (
            <div className="rounded-2xl border overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
              <table className="min-w-full border-collapse">
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    {['내전명', '유형', '상태', '최대 판수', '생성일', ''].map((label) => (
                      <th key={label} className="px-4 py-3.5 text-left text-[10px] font-black text-slate-500 tracking-widest uppercase">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {games.map((g, idx) => (
                    <tr
                      key={g.id}
                      style={{
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                        borderBottom: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <td className="px-4 py-3.5">
                        <span className="font-bold text-white text-sm">{g.title}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        {g.game_type === 'team' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-violet-500/10 border border-violet-500/20 text-violet-400">
                            팀전
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-500/10 border border-blue-500/20 text-blue-400">
                            개인전
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={g.status} /></td>
                      <td className="px-4 py-3.5"><span className="text-sm text-slate-400">{g.max_rounds}판</span></td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs text-slate-500">
                          {new Date(g.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/custom-games/${g.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                              text-xs font-bold transition-all duration-150
                              bg-indigo-500/10 border border-indigo-500/25 text-indigo-400
                              hover:bg-indigo-500/20 hover:text-indigo-300"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            보기
                          </Link>
                          <button
                            onClick={() => handleDelete(g.id)}
                            disabled={deletingId === g.id}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                              text-xs font-bold transition-all duration-150
                              bg-red-500/10 border border-red-500/20 text-red-400
                              hover:bg-red-500/20 hover:text-red-300
                              disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {deletingId === g.id ? <Spinner size={3} /> : (
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                <path strokeLinecap="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(255,255,255,0.02)' }}>
                <span className="text-xs text-slate-600 font-medium">총 {games.length}개</span>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 생성 모달 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
            onClick={() => !creating && setShowModal(false)}
          />
          <div
            className="relative w-full max-w-lg rounded-2xl border p-6 flex flex-col gap-5"
            style={{ background: 'rgb(13,17,23)', borderColor: 'rgba(255,255,255,0.1)' }}
          >
            <div>
              <h2 className="text-lg font-black text-white mb-1">새 내전 만들기</h2>
              <p className="text-sm text-slate-500">참가자와 판수를 설정하세요</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">게임 유형</label>
              <div className="flex gap-2">
                {([['solo', '개인전'], ['team', '팀전 (4팀 × 2인)']] as const).map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => { setGameType(type); setSelectedIds(new Set()) }}
                    disabled={creating}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                      gameType === type
                        ? type === 'team'
                          ? 'bg-violet-500/25 border border-violet-500/50 text-violet-300'
                          : 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300'
                        : 'bg-white/[0.03] border border-white/[0.07] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                    } disabled:opacity-50`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {gameType === 'team' && (
                <p className="mt-1.5 text-xs text-violet-400/70">팀전은 멤버 + 게스트 합산 정확히 8명 필요</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">내전 이름</label>
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                placeholder="예) 5월 내전 1회차"
                disabled={creating}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-white
                  bg-white/[0.04] border border-white/[0.08]
                  placeholder:text-slate-600
                  focus:outline-none focus:border-indigo-500/50 focus:bg-indigo-500/5
                  transition-all duration-200 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">최대 판수</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMaxRounds(n)}
                    disabled={creating}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all duration-150 ${
                      maxRounds === n
                        ? 'bg-indigo-500/25 border border-indigo-500/50 text-indigo-300'
                        : 'bg-white/[0.03] border border-white/[0.07] text-slate-500 hover:text-slate-300 hover:bg-white/[0.06]'
                    } disabled:opacity-50`}
                  >
                    {n}판
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-2 tracking-widest uppercase">
                멤버 선택 ({selectedIds.size}명 {gameType === 'team' ? `/ 합산 정확히 8명` : '/ 최대 8명'})
              </label>
              <div
                className="rounded-xl border overflow-y-auto max-h-52"
                style={{ borderColor: 'rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
              >
                {members.length === 0 ? (
                  <p className="text-center text-slate-600 text-sm py-6">멤버가 없습니다</p>
                ) : (
                  members.map((m) => {
                    const checked = selectedIds.has(m.id)
                    const disabled = creating || (!checked && totalSelected >= 8)
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors
                          border-b last:border-0 ${
                          checked ? 'bg-indigo-500/10' : disabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-white/[0.03]'
                        }`}
                        style={{ borderColor: 'rgba(255,255,255,0.05)' }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={() => toggleMember(m.id)}
                          className="w-4 h-4 rounded accent-indigo-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{m.member_name}</p>
                          <p className="text-xs text-slate-500 truncate">{m.riot_game_name}#{m.riot_tagline}</p>
                        </div>
                        {checked && (
                          <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </label>
                    )
                  })
                )}
              </div>
            </div>

            {/* 게스트 섹션 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-400 tracking-widest uppercase">
                  게스트 ({guestInputs.length}명)
                </label>
                {!showGuestForm && totalSelected < 8 && (
                  <button
                    type="button"
                    onClick={() => setShowGuestForm(true)}
                    disabled={creating}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg
                      text-xs font-bold transition-all duration-150
                      bg-amber-500/10 border border-amber-500/20 text-amber-400
                      hover:bg-amber-500/20 hover:text-amber-300
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                      <path d="M12 4v16m8-8H4" />
                    </svg>
                    추가
                  </button>
                )}
              </div>

              {/* 이미 추가된 게스트 목록 */}
              {guestInputs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {guestInputs.map((g, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border"
                      style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)' }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span className="text-xs font-bold text-white">{g.display_name}</span>
                      <span className="text-[10px] text-slate-500">{g.riot_game_name}#{g.riot_tagline}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveGuest(i)}
                        disabled={creating}
                        className="ml-0.5 text-slate-600 hover:text-red-400 transition-colors disabled:opacity-40"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5} strokeLinecap="round">
                          <path d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 게스트 입력 폼 */}
              {showGuestForm && (
                <div
                  className="p-3 rounded-xl border flex flex-col gap-2"
                  style={{ background: 'rgba(245,158,11,0.04)', borderColor: 'rgba(245,158,11,0.15)' }}
                >
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="표시 이름 (예: 홍길동 부계)"
                      disabled={creating}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-white
                        bg-white/[0.04] border border-white/[0.08]
                        placeholder:text-slate-600
                        focus:outline-none focus:border-amber-500/40
                        disabled:opacity-50 transition-colors"
                    />
                    <input
                      type="text"
                      value={guestRiotId}
                      onChange={(e) => setGuestRiotId(e.target.value)}
                      placeholder="닉네임#태그"
                      disabled={creating}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleAddGuestToList() }}
                      className="flex-1 px-3 py-2 rounded-lg text-xs text-white
                        bg-white/[0.04] border border-white/[0.08]
                        placeholder:text-slate-600
                        focus:outline-none focus:border-amber-500/40
                        disabled:opacity-50 transition-colors"
                    />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => { setShowGuestForm(false); setGuestName(''); setGuestRiotId('') }}
                      disabled={creating}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40"
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      onClick={handleAddGuestToList}
                      disabled={creating || !guestName.trim() || !guestRiotId.trim()}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold
                        bg-amber-500/15 border border-amber-500/25 text-amber-400
                        hover:bg-amber-500/25 hover:text-amber-300
                        disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      추가
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={creating}
                className="flex-1 py-3 rounded-xl text-sm font-bold
                  bg-white/[0.04] border border-white/[0.07] text-slate-400
                  hover:text-slate-200 hover:bg-white/[0.07]
                  disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={creating || (gameType === 'team' ? totalSelected !== 8 : totalSelected < 2) || !titleInput.trim()}
                className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl
                  text-sm font-bold transition-all duration-200
                  bg-indigo-500/20 border border-indigo-500/40 text-indigo-300
                  hover:bg-indigo-500/30 hover:text-indigo-200
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creating ? <><Spinner size={4} /> 생성 중...</> : '내전 시작'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
