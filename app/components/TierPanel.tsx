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

  return (
      <div className="bg-slate-700/30 rounded-xl p-5 border border-slate-600/50">
        <div className="flex items-center justify-between gap-6">
          <div className="w-32 h-32 flex items-center justify-center flex-shrink-0">
            <img
                src={getTierImage(tier)}
                alt={tier ?? 'UNRANKED'}
                className="w-full h-full object-contain"
            />
          </div>

          <div className="flex-1">
            <div className={`${tierBadgeStyle} px-6 py-4 rounded-xl text-center w-full`}>
              <div className="text-xl font-black">{tier ?? 'UNRANKED'}</div>
              {rank && <div className="text-sm opacity-90 mt-1">{rank}</div>}
              <div className="text-sm opacity-90 mt-2 font-bold">{lp} LP</div>
            </div>
          </div>
        </div>
      </div>
  )
}