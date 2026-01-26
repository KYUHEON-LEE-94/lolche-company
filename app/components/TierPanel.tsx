import React from 'react'

type Props = {
    tier: string | null
    rank: string | null
    lp: number
    getTierImage: (tier: string | null) => string
    getTierBadgeStyle: (tier: string | null) => string
}

export default function TierPanel({
                                      tier,
                                      rank,
                                      lp,
                                      getTierImage,
                                      getTierBadgeStyle,
                                  }: Props) {
    const tierBadgeStyle = getTierBadgeStyle(tier)

    // 티어 텍스트 길이에 따라 폰트 크기 조절
    const getTierTextSize = (tier: string | null) => {
        if (!tier) return 'text-base sm:text-xl'
        if (tier.length > 10) return 'text-xs sm:text-sm' // GRANDMASTER (11자)
        if (tier.length > 8) return 'text-sm sm:text-base' // CHALLENGER (10자)
        return 'text-base sm:text-xl'
    }

    return (
        <div className="bg-slate-700/30 rounded-xl p-4 sm:p-5 border border-slate-600/50">
            <div className="flex items-center justify-between gap-4 sm:gap-6">
                {/* 티어 이미지 */}
                <div className="w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center flex-shrink-0">
                    <img
                        src={getTierImage(tier)}
                        alt={tier ?? 'UNRANKED'}
                        className="w-full h-full object-contain"
                    />
                </div>

                {/* 티어 정보 배지 */}
                <div className="flex-1 min-w-0">
                    <div className={`${tierBadgeStyle} px-4 sm:px-6 py-3 sm:py-4 rounded-xl text-center w-full min-h-[88px] sm:min-h-[100px] flex flex-col justify-center`}>
                        <div className={`${getTierTextSize(tier)} font-black leading-tight`}>
                            {tier ?? 'UNRANKED'}
                        </div>
                        {rank && (
                            <div className="text-xs sm:text-sm opacity-90 mt-1">
                                {rank}
                            </div>
                        )}
                        <div className="text-xs sm:text-sm opacity-90 mt-1 sm:mt-2 font-bold">
                            {lp} LP
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}