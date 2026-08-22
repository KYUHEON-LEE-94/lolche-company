import SteamThumb from '@/app/steam/SteamThumb'
import SectionHeader from '@/app/components/ui/SectionHeader'
import { formatSteamDealDeadline, formatSteamMoney, type SteamFeaturedDeal } from '@/lib/steam/featuredDealsShared'

export default function SteamDeals({ deals }: { deals: SteamFeaturedDeal[] | null }) {
  if (deals === null) {
    return (
      <section>
        <SectionHeader title="Steam 할인" hint="한국 Steam 상점의 현재 할인 품목입니다." />
        <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-subtle">
          할인 정보를 잠시 불러올 수 없습니다. 잠시 후 다시 확인해주세요.
        </p>
      </section>
    )
  }
  return <section>
    <SectionHeader title="Steam 할인" hint="한국 Steam 상점의 현재 할인 품목입니다." />
    {deals.length === 0 ? <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-subtle">현재 표시할 할인 품목이 없습니다.</p> :
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {deals.map((deal) => <li key={deal.appid} className="overflow-hidden rounded-2xl border border-line bg-surface transition-colors hover:border-line-strong">
          <a href={`https://store.steampowered.com/app/${deal.appid}/?cc=kr&l=koreana`} target="_blank" rel="noreferrer" className="block">
            <div className="relative aspect-[2.35] bg-surface-2"><SteamThumb appid={deal.appid} name={deal.name} headerImageUrl={deal.imageUrl} /></div>
            <div className="p-4"><p className="truncate text-sm font-bold text-fg">{deal.name}</p><div className="mt-2 flex items-center gap-2"><span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs font-black text-ok-ink">-{deal.discountPercent}%</span><span className="text-xs text-subtle line-through">{formatSteamMoney(deal.originalPrice)}</span><span className="text-sm font-black text-fg">{formatSteamMoney(deal.finalPrice)}</span></div>{formatSteamDealDeadline(deal.expiresAt) && <p className="mt-2 text-[11px] text-subtle">~ {formatSteamDealDeadline(deal.expiresAt)} (KST)</p>}</div>
          </a>
        </li>)}
      </ul>}
  </section>
}
