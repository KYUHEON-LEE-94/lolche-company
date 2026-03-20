// src/app/hall-of-fame/_components/Podium.tsx
import Image from 'next/image';

export default function Podium({ top3 }: { top3: any[] }) {
    // 순위를 2위 - 1위 - 3위 순서로 재배열 (데스크탑 시각적 순서)
    const podiumData = [
        {
            rank: 2,
            data: top3[1],
            height: 'h-[160px]',
            color: 'from-slate-400 to-slate-600',
            shadow: 'shadow-slate-500/20',
            glow: 'group-hover:shadow-slate-400/40'
        },
        {
            rank: 1,
            data: top3[0],
            height: 'h-[200px]',
            color: 'from-yellow-300 via-amber-500 to-yellow-600',
            shadow: 'shadow-amber-500/30',
            glow: 'group-hover:shadow-amber-400/50',
            isFirst: true
        },
        {
            rank: 3,
            data: top3[2],
            height: 'h-[130px]',
            color: 'from-orange-400 to-orange-700',
            shadow: 'shadow-orange-600/20',
            glow: 'group-hover:shadow-orange-500/40'
        },
    ];

    return (
        <div className="flex flex-col md:flex-row items-center md:items-end justify-center gap-10 md:gap-2 h-full pt-20 pb-10">
            {podiumData.map((pos) => {
                if (!pos.data) return <div key={pos.rank} className="hidden md:block w-64" />;

                const profileImg = pos.data.members?.profile_image_path
                    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${pos.data.members.profile_image_path}`
                    : '/images/logo.png';

                return (
                    <div
                        key={pos.rank}
                        className={`group relative flex flex-col items-center w-full max-w-[260px] transition-all duration-500 ${
                            pos.isFirst ? 'z-20 md:-translate-y-6 scale-105' : 'z-10'
                        }`}
                    >
                        {/* 왕관 및 랭크 아이콘 */}
                        <div className="relative mb-4">
                            {pos.isFirst && (
                                <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-5xl animate-bounce">
                                    👑
                                </div>
                            )}
                            <div className={`relative w-28 h-28 sm:w-32 sm:h-32 rounded-full p-1 bg-gradient-to-tr ${pos.color} ${pos.shadow} transition-all duration-500 ${pos.glow}`}>
                                <div className="w-full h-full rounded-full overflow-hidden border-4 border-[#0a0a0c]">
                                    <img
                                        src={profileImg}
                                        alt={pos.data.members?.member_name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                    />
                                </div>
                                {/* 순위 배지 */}
                                <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full bg-gradient-to-br ${pos.color} flex items-center justify-center font-black text-slate-900 border-4 border-[#0a0a0c] text-lg`}>
                                    {pos.rank}
                                </div>
                            </div>
                        </div>

                        {/* 이름 및 티어 정보 (시상대 위쪽) */}
                        <div className="text-center mb-4 px-2">
                            <h3 className="text-lg sm:text-xl font-black text-white line-clamp-2 break-keep min-h-[3rem] flex items-center justify-center mb-1">
                                {pos.data.members?.member_name}
                            </h3>
                            <div className="flex flex-col items-center gap-1">
                                <span className={`text-xs sm:text-sm font-black px-3 py-0.5 rounded-full bg-white/10 border border-white/20 ${pos.isFirst ? 'text-amber-400' : 'text-slate-300'}`}>
                                    {pos.data.tier} {pos.data.rank}
                                </span>
                                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter">
                                    {pos.data.lp.toLocaleString()} LP
                                </span>
                            </div>
                        </div>

                        {/* 🏛️ 시상대 베이스 (데스크탑에서만 높이 차이 강조) */}
                        <div className={`hidden md:flex w-full ${pos.height} bg-gradient-to-b ${pos.color} opacity-20 rounded-t-3xl border-t-2 border-white/20 relative overflow-hidden group-hover:opacity-30 transition-opacity`}>
                            {/* 배경에 큰 숫자 장식 */}
                            <span className="absolute -bottom-10 -right-5 text-9xl font-black text-white/5 italic">
                                {pos.rank}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}