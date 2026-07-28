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
    <div className={`${CARD} px-6 py-10 text-center text-sm text-muted`}>
      <p>{children}</p>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
