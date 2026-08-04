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
    <div className={`${CARD} px-6 py-12 text-center text-sm text-muted`}>
      <span className="mx-auto mb-4 block h-2 w-2 rounded-full bg-brand/60 ring-4 ring-brand/10" aria-hidden />
      <p className="font-medium">{children}</p>
      {hint && <p className="mt-2 text-xs text-faint">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
