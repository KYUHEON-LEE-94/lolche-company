// TierPanel.tsx
// MemberRanking 내부의 MemberCard가 직접 티어를 렌더링하므로,
// 이 파일은 외부에서 TierPanel을 별도로 사용할 때를 위해 유지합니다.

type TierPanelProps = {
    tier: string | null
    rank: string | null
    lp: number
}

const TIER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
    CHALLENGER:  { text: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/20' },
    GRANDMASTER: { text: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
    MASTER:      { text: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/20' },
    DIAMOND:     { text: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
    EMERALD:     { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    PLATINUM:    { text: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/20' },
    GOLD:        { text: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
    SILVER:      { text: 'text-slate-400',   bg: 'bg-slate-500/10',   border: 'border-slate-500/20' },
    BRONZE:      { text: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/20' },
    IRON:        { text: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20' },
}

const TIER_ICONS: Record<string, string> = {
    CHALLENGER: '♛', GRANDMASTER: '♦', MASTER: '◆',
    DIAMOND: '◇', EMERALD: '◈', PLATINUM: '◉',
    GOLD: '○', SILVER: '○', BRONZE: '○', IRON: '◌',
}

export default function TierPanel({ tier, rank, lp }: TierPanelProps) {
    const key = tier?.toUpperCase() ?? ''
    const colors = TIER_COLORS[key] ?? {
        text: 'text-slate-500',
        bg: 'bg-slate-700/30',
        border: 'border-slate-600/20',
    }
    const icon = TIER_ICONS[key] ?? '?'

    return (
        <div className="flex items-center gap-3">
            {/* 아이콘 */}
            <span className={`text-3xl leading-none ${colors.text}`}>{icon}</span>

            {/* 티어명 */}
            <div className="flex-1">
                <p className={`text-xl font-black tracking-wide leading-tight ${colors.text}`}>
                    {tier ?? 'UNRANKED'}
                </p>
                <p className="text-[11px] font-bold text-slate-500 tracking-widest">
                    {rank ? `${rank} · DIVISION` : 'NO RANK'}
                </p>
            </div>

            {/* LP */}
            <div className={`text-right rounded-xl border px-3 py-2 ${colors.bg} ${colors.border}`}>
                <p className="text-lg font-black text-white leading-none tabular-nums">{lp}</p>
                <p className="text-[10px] font-bold text-slate-500 tracking-widest mt-0.5">LP</p>
            </div>
        </div>
    )
}