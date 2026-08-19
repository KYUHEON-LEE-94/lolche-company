import Image from 'next/image'

export type DiscordTop5Entry = {
  name: string
  avatarUrl: string | null
  voiceLabel: string
}

const MEDALS = ['bg-amber-400/20 text-amber-600', 'bg-slate-300/25 text-slate-500', 'bg-orange-400/20 text-orange-600']

/** 대시보드 우측: 최근 7일 Discord 음성 활동 TOP5. 훅 없는 순수 컴포넌트라 서버에서 렌더한다. */
export default function DashboardDiscordTop5({ entries }: { entries: DiscordTop5Entry[] }) {
  return (
    <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-ink">최근 7일</p>
          <h2 className="mt-0.5 text-lg font-black tracking-tight text-fg">Discord 음성 TOP 5</h2>
        </div>
      </div>

      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-subtle">이번 주 음성 활동 기록이 아직 없어요.</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {entries.map((entry, index) => (
            <li key={entry.name + index} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3 py-2">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black tabular-nums ${index < 3 ? MEDALS[index] : 'bg-surface text-subtle'}`}>
                {index + 1}
              </span>
              <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full border border-line bg-surface">
                {entry.avatarUrl ? (
                  <Image src={entry.avatarUrl} alt="" fill sizes="32px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[11px] font-black text-muted">{entry.name.slice(0, 1)}</span>
                )}
              </div>
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-fg">{entry.name}</span>
              <span className="shrink-0 text-sm font-black tabular-nums text-brand-ink">{entry.voiceLabel}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
