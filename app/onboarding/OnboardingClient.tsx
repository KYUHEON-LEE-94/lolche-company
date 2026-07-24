'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import MemberSelfForm from '@/app/profile/MemberSelfForm'
import SteamLinkForm from '@/app/steam/SteamLinkForm'
import { BTN_GHOST, BTN_PRIMARY } from '@/lib/ui/styles'

type Step = 'riot' | 'steam'

export default function OnboardingClient() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('riot')

  // 라이엇·스팀 모두 건너뛸 수 있다(사용자 결정). 완료/건너뛰기는 대시보드로.
  const goToDashboard = () => {
    router.push('/')
  }

  return (
    <div className="grid gap-6">
      <div className="flex items-center gap-2 text-xs font-black tracking-widest uppercase text-slate-500">
        <span className={step === 'riot' ? 'text-indigo-300' : 'text-slate-600'}>1. 라이엇</span>
        <span className="text-slate-700">→</span>
        <span className={step === 'steam' ? 'text-indigo-300' : 'text-slate-600'}>2. 스팀</span>
      </div>

      {step === 'riot' ? (
        <>
          <MemberSelfForm
            initial={null}
            status={null}
            rejectedReason={null}
            accounts={[]}
            migrationRequired={false}
            onRegistered={() => setStep('steam')}
          />
          <button type="button" onClick={goToDashboard} className={`${BTN_GHOST} w-full`}>
            라이엇 등록은 나중에 하기
          </button>
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm font-bold text-emerald-300">
            라이엇 등록이 접수되었어요. 관리자 승인 후 랭킹에 표시됩니다. 이어서 스팀 계정도 연결해볼까요?
          </div>
          <SteamLinkForm />
          <button type="button" onClick={goToDashboard} className={`${BTN_PRIMARY} w-full`}>
            완료하고 시작하기
          </button>
        </>
      )}
    </div>
  )
}
