import { SHELL, CONTAINER } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import ShopClient from './ShopClient'

// 개인화 데이터(잔액/보유/내역)는 클라 아일랜드가 force-dynamic API 로 가져온다.
// 페이지 자체는 세션을 읽지 않는 단순 셸이지만, ISR 로 캐시되지 않도록 dynamic 을 명시한다.
export const dynamic = 'force-dynamic'

export default function ShopPage() {
  return (
    <div className={SHELL}>
      <div className={CONTAINER}>
        <PageHeader
          kicker="Shop"
          accent="amber"
          title="포인트 상점"
          description="포인트로 프로필 프레임과 랭킹 카드 배경을 구매하고 장착하세요."
          className="mb-8"
        />
        <ShopClient />
      </div>
    </div>
  )
}
