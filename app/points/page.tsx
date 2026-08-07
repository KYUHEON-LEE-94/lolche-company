import type { Metadata } from 'next'
import { SHELL, CONTAINER } from '@/lib/ui/styles'
import PageHeader from '@/app/components/ui/PageHeader'
import PointsHistory from './PointsHistory'

export const metadata: Metadata = {
  title: '포인트 내역 · 롤토 컴퍼니',
}

export default function PointsPage() {
  return (
    <main className={SHELL}>
      <div className={CONTAINER}>
        <PageHeader
          kicker="Points"
          accent="indigo"
          title="포인트 내역"
          description="획득하거나 사용한 포인트 이력입니다."
        />
        <PointsHistory />
      </div>
    </main>
  )
}
