import { H1, KICKER, MUTED } from '@/lib/ui/styles'

// ⚠ 순수 서버 컴포넌트. props 외의 어떤 세션·쿠키도 읽지 않는다
//    (/steam 이 ISR 이라 여기서 세션을 읽으면 사용자 간 캐시 유출이 된다).

type Accent = 'amber' | 'emerald' | 'sky' | 'indigo'

const PILL: Record<Accent, string> = {
  amber: 'border-amber-500/20 bg-amber-500/10',
  emerald: 'border-emerald-500/20 bg-emerald-500/10',
  sky: 'border-sky-500/20 bg-sky-500/10',
  indigo: 'border-indigo-500/20 bg-indigo-500/10',
}

const TEXT: Record<Accent, string> = {
  amber: 'text-warn-ink',
  emerald: 'text-ok-ink',
  sky: 'text-sky-400',
  indigo: 'text-brand-ink',
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
      <div className={`mb-4 inline-flex items-center rounded-full border px-3 py-1.5 ${PILL[accent]}`}>
        <span className={`${KICKER} ${TEXT[accent]}`}>{kicker}</span>
      </div>
      <h1 className={H1}>{title}</h1>
      {description && <p className={`mt-3 max-w-2xl leading-relaxed ${MUTED}`}>{description}</p>}
    </header>
  )
}
