import { H2 } from '@/lib/ui/styles'

export default function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className={H2}>{title}</h2>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      {action}
    </div>
  )
}
