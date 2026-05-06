import Link from 'next/link';

type SeasonTabItem = { id: number; season_name: string }

export default function SeasonTab({ seasons, currentId }: { seasons: SeasonTabItem[]; currentId: number }) {
    return (
        <nav className="flex flex-wrap justify-center gap-2 mb-12">
            {seasons.map((s) => (
                <Link
                    key={s.id}
                    href={`/hall-of-fame?season=${s.id}`}
                    className={`px-4 py-2 rounded-full text-xs font-bold tracking-widest transition-all ${
                        s.id === currentId
                            ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20'
                            : 'bg-slate-900 text-slate-500 hover:text-slate-300 border border-slate-800'
                    }`}
                >
                    {s.season_name.toUpperCase()}
                </Link>
            ))}
        </nav>
    );
}