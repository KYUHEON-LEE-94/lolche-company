'use client'

import { FormEvent, useState } from 'react'
import { supabaseClient } from '@/lib/supabase'

export default function AdminMemberRegisterPage() {
  const [memberName, setMemberName] = useState('')
  const [riotGameName, setRiotGameName] = useState('')
  const [riotTagline, setRiotTagline] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)
    setError(null)

    try {
      const { data, error: insertError } = await supabaseClient
          .from('members')
          .insert([
            {
              member_name: memberName,
              riot_game_name: riotGameName,
              riot_tagline: riotTagline,
            } as any,
          ])
          .select('id')
          .single()

      if (insertError || !data) {
        console.error(insertError)
        setError('멤버 생성에 실패했습니다.')
        setLoading(false)
        return
      }

      const memberId = data.id as string

      const res = await fetch(`/api/members/${memberId}/sync`, {
        method: 'POST',
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('sync error', body)
        setError(`동기화에 실패했습니다. (${res.status}) ${body.error ?? ''}`)
        setLoading(false)
        return
      }

      console.log('sync result', body)
      setMessage('멤버가 성공적으로 등록 및 동기화되었습니다.')
      setMemberName('')
      setRiotGameName('')
      setRiotTagline('')
    } catch (err) {
      console.error(err)
      setError('알 수 없는 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-500 via-blue-600 to-indigo-600 shadow-2xl shadow-blue-500/40 mb-6 relative">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-blue-400 to-indigo-400 blur-xl opacity-50"></div>
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-slate-800 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-3 tracking-tight">
            새 멤버 등록
          </h1>
          <p className="text-lg text-slate-600 flex items-center justify-center gap-2">
            <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            단톡방 멤버를 등록하고 Riot 계정과 자동 연동하세요
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-gradient-to-br from-white to-slate-50 rounded-2xl shadow-xl border border-slate-200/60 p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 단톡방 ID */}
            <div className="group">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-3">
                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                단톡방 아이디
              </label>
              <div className="relative">
                <input
                    type="text"
                    value={memberName}
                    onChange={(e) => setMemberName(e.target.value)}
                    className="w-full border-2 border-slate-200 rounded-xl px-4 py-3.5 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none bg-white placeholder:text-slate-400"
                    placeholder="예: 철수, 영희, 룸메1"
                    required
                />
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 opacity-0 group-focus-within:opacity-10 transition-opacity pointer-events-none"></div>
              </div>
              <p className="mt-2 text-xs text-slate-500 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                단톡방에서 사용하는 닉네임을 입력하세요
              </p>
            </div>

            {/* Riot ID Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="font-bold text-blue-900">Riot 계정 정보</h3>
              </div>

              <div className="space-y-4">
                {/* 게임명 */}
                <div className="group">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    게임명
                  </label>
                  <input
                      type="text"
                      value={riotGameName}
                      onChange={(e) => setRiotGameName(e.target.value)}
                      className="w-full border-2 border-blue-200 rounded-lg px-4 py-3 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none bg-white placeholder:text-slate-400"
                      placeholder="예: Hide on bush"
                      required
                  />
                </div>

                {/* 태그라인 */}
                <div className="group">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    태그라인
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-10 h-12 bg-blue-100 rounded-lg border-2 border-blue-200">
                      <span className="text-blue-600 text-lg font-bold">#</span>
                    </div>
                    <input
                        type="text"
                        value={riotTagline}
                        onChange={(e) => setRiotTagline(e.target.value)}
                        className="flex-1 border-2 border-blue-200 rounded-lg px-4 py-3 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none bg-white placeholder:text-slate-400"
                        placeholder="예: KR1"
                        required
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-white/60 rounded-lg border border-blue-200/60">
                <p className="text-xs text-slate-600 flex items-start gap-2">
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Riot ID는 게임명#태그라인 형식입니다. (예: Hide on bush#KR1)</span>
                </p>
              </div>
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={loading}
                className="relative w-full px-6 py-4 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white font-bold shadow-lg shadow-blue-500/40 hover:shadow-xl hover:shadow-blue-500/50 disabled:opacity-60 disabled:cursor-not-allowed disabled:shadow-none transition-all duration-300 overflow-hidden group"
            >
            <span className="relative z-10 flex items-center justify-center gap-2">
              {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    등록 & 동기화 중...
                  </>
              ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    멤버 등록하기
                  </>
              )}
            </span>
              <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-indigo-400 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
            </button>
          </form>

          {/* Success Message */}
          {message && (
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-green-900 font-semibold">{message}</p>
                </div>
              </div>
          )}

          {/* Error Message */}
          {error && (
              <div className="mt-6 p-4 rounded-xl bg-gradient-to-r from-red-50 to-rose-50 border-2 border-red-200 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <p className="text-red-900 font-semibold">{error}</p>
                </div>
              </div>
          )}
        </div>
      </div>
  )
}