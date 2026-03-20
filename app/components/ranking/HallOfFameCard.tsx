// src/components/ranking/HallOfFameCard.tsx
import Image from 'next/image';

interface RankerProps {
    ranker: any; // Database['public']['Tables']['hall_of_fame']['Row'] & { members: any }
    position: number; // 1, 2, 3
}

export default function HallOfFameCard({ ranker, position }: RankerProps) {
    // 순위별 스타일 설정
    const styles = {
        1: { border: 'border-yellow-400', bg: 'bg-yellow-400/10', shadow: 'shadow-yellow-400/50', size: 'w-32 h-32', crown: '👑' },
        2: { border: 'border-slate-300', bg: 'bg-slate-300/10', shadow: 'shadow-slate-300/50', size: 'w-28 h-28', crown: '' },
        3: { border: 'border-orange-500', bg: 'bg-orange-500/10', shadow: 'shadow-orange-500/50', size: 'w-24 h-24', crown: '' },
    }[position as 1 | 2 | 3];

    return (
        <div className={`flex flex-col items-center p-6 rounded-2xl border-2 shadow-lg transition-transform hover:scale-105 ${styles.bg} ${styles.border} ${styles.shadow}`}>

            <div className="relative mb-4">
                {position === 1 && <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-3xl animate-bounce">{styles.crown}</span>}
                <div className={`relative rounded-full overflow-hidden border-4 ${styles.border} ${styles.size}`}>
                    <Image
                        src={ranker.members?.profile_image_path || '/default-profile.png'}
                        alt={ranker.members?.member_name}
                        fill
                        className="object-cover"
                    />
                </div>
                <div className={`absolute -bottom-2 -right-2 w-8 h-8 rounded-full flex items-center justify-center font-bold text-white shadow-md ${styles.border.replace('border', 'bg')}`}>
                    {position}
                </div>
            </div>

            <h3 className="text-xl font-bold mb-1 text-center line-clamp-2 break-keep leading-tight h-[3rem] flex items-center justify-center">
                {ranker.members?.member_name}
            </h3>
            <p className="text-sm font-medium opacity-80">{ranker.tier} {ranker.rank}</p>
            <p className="text-xs mt-1 text-blue-400 font-bold">{ranker.lp} LP</p>
        </div>
    );
}