import type { Metadata } from 'next'
import ComingSoon from '@/app/components/ComingSoon'

export const metadata: Metadata = {
  title: '스팀 · 롤토 컴퍼니',
}

export default function SteamPage() {
  return (
    <ComingSoon
      title="스팀"
      description="지금 스팀에서 게임 중인 멤버를 한눈에 볼 수 있는 화면을 준비하고 있습니다. 스팀 프로필 연동 기능도 함께 제공될 예정입니다."
    />
  )
}
