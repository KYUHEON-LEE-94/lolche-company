'use client'

import { FormEvent, useState } from 'react'

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
      const memberResponse = await fetch('/api/admin/members/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_name: memberName,
          riot_game_name: riotGameName,
          riot_tagline: riotTagline,
        }),
      })

      const memberBody = await memberResponse.json().catch(() => ({}))
      console.log(memberBody);
      if (!memberResponse.ok || !memberBody.ok) {
        setError(memberBody.message ?? '멤버 생성에 실패했습니다.')
        setLoading(false)
        return
      }

      const memberId = memberBody.memberId as string

      // 2) Riot API 동기화 호출
      const res = await fetch(`/api/members/${memberId}/sync`, {
        method: 'POST',
      })

      const body = await res.json().catch(() => ({}))

      if (!res.ok) {
        console.error('sync error', body)
        setError(
            `동기화에 실패했습니다. (${res.status}) ${body.error ?? ''}`,
        )
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
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">단톡방 멤버 등록</h1>
          <p className="text-gray-600">새로운 멤버를 등록하고 Riot 계정과 연동합니다.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              단톡방 아이디
            </label>
            <input
                type="text"
                value={memberName}
                onChange={(e) => setMemberName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="예: 철수, 영희, 룸메1"
                required
            />
            <p className="mt-1.5 text-xs text-gray-500">단톡방에서 사용하는 닉네임을 입력하세요</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              라이엇 게임명
            </label>
            <input
                type="text"
                value={riotGameName}
                onChange={(e) => setRiotGameName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                placeholder="예: Hide on bush"
                required
            />
            <p className="mt-1.5 text-xs text-gray-500">Riot ID의 게임명 부분</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              태그라인
            </label>
            <div className="flex items-center gap-2">
              <span className="text-gray-400 text-lg">#</span>
              <input
                  type="text"
                  value={riotTagline}
                  onChange={(e) => setRiotTagline(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                  placeholder="예: KR1"
                  required
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">Riot ID의 태그라인 부분 (# 제외)</p>
          </div>

          <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold shadow-md shadow-blue-200 hover:shadow-lg hover:shadow-blue-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
          >
            {loading ? (
                <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              등록 & 동기화 중...
            </span>
            ) : '멤버 등록'}
          </button>
        </form>

        {message && (
            <div className="mt-6 p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <p className="text-green-800 font-medium">{message}</p>
              </div>
            </div>
        )}

        {error && (
            <div className="mt-6 p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <p className="text-red-800 font-medium">{error}</p>
              </div>
            </div>
        )}
      </div>
  )
}