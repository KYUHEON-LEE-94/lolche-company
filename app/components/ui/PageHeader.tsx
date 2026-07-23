import { H1, KICKER, MUTED } from '@/lib/ui/styles'

// ⚠ 순수 서버 컴포넌트. props 외의 어떤 세션·쿠키도 읽지 않는다
//    (/steam 이 ISR 이라 여기서 세션을 읽으면 사용자 간 캐시 유출이 된다).

type Accent = 'amber' | 'emerald' | 'sky' | 'indigo'

const LINE: Record<Accent, string> = {
  amber: 'to-amber-500/50',
  emerald: 'to-emerald-500/50',
  sky: 'to-sky-500/50',
  indigo: 'to-indigo-500/50',
}

const TEXT: Record<Accent, string> = {
  amber: 'text-amber-500',
  emerald: 'text-emerald-400',
  sky: 'text-sky-400',
  indigo: 'text-indigo-400',
}

export default function PageHeader({
  kicker,
  title,
  description,
  accent = 'indigo',
  className = 'mb-10',
}: {
  kicker: string
  title: string
  description?: string
  accent?: Accent
  className?: string
}) {
  return (
    <header className={className}>
      <div className="mb-3 inline-flex items-center gap-3">
        <div className={`h-px w-10 bg-gradient-to-r from-transparent ${LINE[accent]}`} />
        <span className={`${KICKER} ${TEXT[accent]}`}>{kicker}</span>
      </div>
      <h1 className={H1}>{title}</h1>
      {description && <p className={`mt-2 ${MUTED}`}>{description}</p>}
    </header>
  )
}
