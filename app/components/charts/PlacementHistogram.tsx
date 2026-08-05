'use client'

const placementTone = (placement: number) => {
  if (placement === 1) {
    return {
      text: 'text-warn-ink',
      bar: 'bg-amber-400',
      border: 'border-amber-400/30',
    }
  }
  if (placement <= 4) {
    return {
      text: 'text-ok-ink',
      bar: 'bg-emerald-400',
      border: 'border-emerald-400/25',
    }
  }
  return {
    text: 'text-muted',
    bar: 'bg-slate-500',
    border: 'border-line',
  }
}

export default function PlacementHistogram({
  distribution,
}: {
  distribution: number[]
}) {
  const total = distribution.reduce((a, b) => a + b, 0)
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-faint text-xs">
        매치 데이터 없음
      </div>
    )
  }

  return (
    <div
      className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      aria-label={`등수 분포, 총 ${total}판`}
    >
      {distribution.map((count, i) => {
        const placement = i + 1
        const percentage = Math.round((count / total) * 100)
        const tone = placementTone(placement)

        return (
          <div
            key={placement}
            className={`rounded-xl border bg-surface px-3 py-2.5 ${tone.border}`}
            aria-label={`${placement}위 ${count}회, 전체의 ${percentage}퍼센트`}
          >
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <span className={`text-sm font-black ${tone.text}`}>{placement}위</span>
              <span className="text-xs font-bold text-fg">
                {count}회 <span className="font-medium text-subtle">· {percentage}%</span>
              </span>
            </div>
            <div
              role="progressbar"
              aria-label={`${placement}위 비율`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percentage}
              className="h-1.5 overflow-hidden rounded-full bg-surface-2"
            >
              <div
                className={`h-full rounded-full transition-[width] ${tone.bar}`}
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
