import type { PublicTitleBadge } from '@/lib/achievements/titles'

export default function TitleBadges({
  titles,
  compact = false,
  className = '',
}: {
  titles?: PublicTitleBadge[]
  compact?: boolean
  className?: string
}) {
  if (!titles?.length) return null

  return (
    <div className={`flex min-w-0 items-center gap-1 ${compact ? 'flex-nowrap overflow-hidden' : 'flex-wrap'} ${className}`} aria-label="장착 칭호">
      {titles.slice(0, 3).map((title) => (
        <span
          key={title.id}
          className={`inline-flex min-w-0 max-w-full items-center rounded-full border border-amber-400/30 bg-amber-400/10 font-black text-warn-ink shadow-sm backdrop-blur-sm ${
            compact ? 'px-1.5 py-0.5 text-[9px] leading-none sm:text-[10px]' : 'px-2 py-1 text-[11px] leading-none'
          }`}
          title={title.label}
        >
          <span aria-hidden className="mr-1 text-amber-400">✦</span>
          <span className="truncate">{title.label}</span>
        </span>
      ))}
    </div>
  )
}
