'use client'

// 1~8위 8칸 분포. distribution[0] = 1위 횟수.
const BAR_COLOR = (placement: number) =>
  placement === 1 ? '#fbbf24' : placement <= 4 ? '#34d399' : '#64748b'

export default function PlacementHistogram({
  distribution,
}: {
  distribution: number[]
}) {
  const total = distribution.reduce((a, b) => a + b, 0)
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-slate-600 text-xs">
        매치 데이터 없음
      </div>
    )
  }

  const max = Math.max(...distribution)

  return (
    <div className="flex items-end gap-1.5 h-28">
      {distribution.map((count, i) => {
        const placement = i + 1
        const color = BAR_COLOR(placement)
        // 0건이어도 축이 보이도록 최소 2% 높이를 남긴다.
        const pct = max === 0 ? 0 : (count / max) * 100
        return (
          <div key={placement} className="flex-1 flex flex-col items-center gap-1 h-full">
            <div className="flex-1 w-full flex items-end">
              <div
                className="w-full rounded-t-md transition-all"
                style={{
                  height: `${Math.max(pct, count > 0 ? 6 : 2)}%`,
                  backgroundColor: color,
                  opacity: count > 0 ? 0.85 : 0.2,
                }}
                title={`${placement}위 ${count}회`}
              />
            </div>
            <span className="text-[10px] font-bold leading-none" style={{ color }}>
              {count}
            </span>
            <span className="text-[10px] text-slate-600 leading-none">{placement}</span>
          </div>
        )
      })}
    </div>
  )
}
