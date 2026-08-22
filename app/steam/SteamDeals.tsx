import SteamThumb from '@/app/steam/SteamThumb'
import SectionHeader from '@/app/components/ui/SectionHeader'
import type { SteamFeaturedDeal } from '@/lib/steam/featuredDeals'

const money = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 })
function formatDeadline(seconds: number | null) {
  if (!seconds) return null
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul' }).format(new Date(seconds * 1000))
}

export default function SteamDeals({ deals }: { deals: SteamFeaturedDeal[] | null }) {
  if (deals === null) return null
  return <section>
    <SectionHeader title="Steam 할인" hint="한국 Steam 상점의 현재 할인 품목입니다." />
    {deals.length === 0 ? <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-subtle">현재 표시할 할인 품목이 없습니다.</p> :
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal) => <li key={deal.appid} className="overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
          <a href={`https://store.steampowered.com/app/${deal.appid}/?cc=kr&l=koreana`} target="_blank" rel="noreferrer" className="block">
            <div className="relative aspect-[2.35] bg-surface-2"><SteamThumb appid={deal.appid} name={deal.name} headerImageUrl={deal.imageUrl} /></div>
            <div className="p-4"><p className="truncate text-sm font-bold text-fg">{deal.name}</p><div className="mt-2 flex items-center gap-2"><span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-black text-ok-ink">-{deal.discountPercent}%</span><span className="text-xs text-subtle line-through">{money.format(deal.originalPrice / 100)}</span><span className="text-sm font-black text-fg">{money.format(deal.finalPrice / 100)}</span></div>{formatDeadline(deal.expiresAt) && <p className="mt-2 text-[11px] text-subtle">~ {formatDeadline(deal.expiresAt)} (KST)</p>}</div>
          </a>
        </li>)}
      </ul>}
  </section>
}
