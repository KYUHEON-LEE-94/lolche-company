'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CARD } from '@/lib/ui/styles'

type ProfileStatus = {
  hasMember: boolean
  status: string | null
  riotAccountCount: number
  hasSteam: boolean
  hasProfileImage: boolean
  steamVisibilityOk: boolean
}

type Item = {
  key: string
  label: string
  done: boolean
  hint: string
  href: string
  cta: string
}

function buildItems(s: ProfileStatus): Item[] {
  return [
    {
      key: 'member',
      label: '멤버 등록 신청',
      done: s.hasMember,
      hint: '라이엇 ID를 등록해야 랭킹에 올라가요.',
      href: '/profile',
      cta: '등록하기',
    },
    {
      key: 'approved',
      label: '관리자 승인',
      done: s.status === 'approved',
      hint:
        s.status === 'rejected'
          ? '신청이 반려됐어요. 사유를 확인하고 다시 신청해주세요.'
          : '승인되면 랭킹과 프로필 설정이 열려요.',
      href: '/profile',
      cta: '상태 보기',
    },
    {
      key: 'steam',
      label: '스팀 계정 연결',
      done: s.hasSteam,
      hint: '같이 할 게임을 찾아줘요.',
      href: '/steam',
      cta: '연결하기',
    },
    {
      key: 'image',
      label: '프로필 이미지',
      done: s.hasProfileImage,
      hint: '랭킹 카드에 내 얼굴이 붙어요.',
      href: '/profile',
      cta: '설정하기',
    },
  ]
}

export default function ProfileChecklist() {
  const [status, setStatus] = useState<ProfileStatus | null>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/me/profile-status')
      .then((r) => {
        // 401은 비로그인 = 정상 상황이다. 에러로 찍으면 콘솔이 오염되고
        // 진짜 장애가 묻힌다. 체크리스트를 렌더하지 않는 것으로 충분하다.
        if (r.status === 401) return null
        if (!r.ok) return Promise.reject(new Error(`HTTP ${r.status}`))
        return r.json()
      })
      .then((d) => {
        if (alive && d) setStatus(d as ProfileStatus)
      })
      .catch((e) => {
        // 체크리스트는 부가 안내다. 실패해도 화면을 깨뜨리지 않고 조용히 숨긴다.
        console.error('profile-status 조회 실패:', e instanceof Error ? e.message : '오류 발생')
      })
    return () => {
      alive = false
    }
  }, [])

  if (!status) return null

  const items = buildItems(status)
  const doneCount = items.filter((i) => i.done).length

  // 전부 완료한 사용자에게 체크리스트는 노이즈다.
  if (doneCount === items.length) return null

  return (
    <section className={`${CARD} p-5`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-white">프로필 완성도</h2>
        <span className="text-xs font-bold text-slate-400">
          {doneCount} / {items.length}
        </span>
      </div>

      <div
        className="mt-3 h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden"
        role="progressbar"
        aria-valuenow={doneCount}
        aria-valuemin={0}
        aria-valuemax={items.length}
      >
        <div
          className="h-full bg-brand transition-all"
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>

      <ul className="mt-4 space-y-2">
        {items.map((item) => (
          <li
            key={item.key}
            className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2.5"
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                item.done ? 'bg-ok/20 text-emerald-400' : 'bg-white/[0.06] text-slate-500'
              }`}
            >
              {item.done ? '✓' : '·'}
            </span>

            <div className="min-w-0 flex-1">
              <p className={`text-sm font-bold ${item.done ? 'text-slate-400 line-through' : 'text-white'}`}>
                {item.label}
              </p>
              {!item.done && <p className="mt-0.5 text-xs text-slate-500">{item.hint}</p>}
            </div>

            {!item.done && (
              <Link
                href={item.href}
                className="shrink-0 self-center rounded-lg bg-brand/10 border border-brand/30 px-2.5 py-1.5 text-xs font-bold text-indigo-300 hover:bg-brand/20 transition-colors"
              >
                {item.cta}
              </Link>
            )}
          </li>
        ))}
      </ul>

      {status.hasSteam && !status.steamVisibilityOk && (
        <p className="mt-3 text-xs text-amber-400">
          스팀 프로필이 비공개예요. 공개로 바꾸면 보유 게임을 같이 찾아볼 수 있어요.
        </p>
      )}
    </section>
  )
}
