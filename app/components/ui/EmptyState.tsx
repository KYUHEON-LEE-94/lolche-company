import { CARD } from '@/lib/ui/styles'

export default function EmptyState({
  children,
  hint,
  action,
}: {
  children: React.ReactNode
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className={`${CARD} px-6 py-10 text-center text-sm text-slate-400`}>
      <p>{children}</p>
      {hint && <p className="mt-2 text-xs text-slate-600">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
