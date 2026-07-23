import type { Metadata } from 'next'
import ComingSoon from '@/app/components/ComingSoon'

export const metadata: Metadata = {
  title: '롤 랭킹 · 롤토 컴퍼니',
}

export default function LolPage() {
  return (
    <ComingSoon
      title="롤 랭킹"
      description="리그 오브 레전드 솔로랭크·자유랭크 랭킹을 준비하고 있습니다. 등록된 라이엇 계정을 그대로 사용하므로 별도 입력은 필요하지 않습니다."
    />
  )
}
