'use client'

import { useEffect, useState, type KeyboardEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { isDiscordAvatarUrl } from '@/lib/members/avatar'
import { resolveFrameUrl, isSpinningFrame } from '@/lib/cosmetics/frameUrl'
import { resolveRankBgUrl } from '@/lib/cosmetics/rankBgUrl'
import { rankEffectClass } from '@/lib/cosmetics/rankEffects'
import RankCardBackground from '@/app/components/ranking/RankCardBackground'
import CardCarousel from '@/app/components/ui/CardCarousel'
import { profileThemeClass } from '@/lib/profile/themes'
import TitleBadges from '@/app/components/TitleBadges'
import type { PublicTitleBadge } from '@/lib/achievements/titles'

type Props = {
    member: {
        id: string
        member_name: string
        riot_id: string
        discord_avatar_url: string | null
        profile_frame_path: string | null
        profile_updated_at: string | null
    }
    equippedTitles: PublicTitleBadge[]
}

type Frame = {
    id: string
    key: string
    label: string
    image_path: string
    sort_order: number
    price_points: number
    owned: boolean
    equipped: boolean
}
type Effect={id:string;label:string;description:string|null;effect_key:string|null;image_path:string|null;price_points:number;owned:boolean;equipped:boolean}
type Theme={id:string;key:string;label:string;description:string;price_points:number;owned:boolean;equipped:boolean}

type CosmeticTab = 'theme' | 'frame' | 'background'

export default function ProfileEditor({ member, equippedTitles }: Props) {
    // DB 초기값 → state로 복사해서 이후 즉시 반영되게
    const [framePath, setFramePath] = useState<string | null>(member.profile_frame_path)
    const [frameUrl, setFrameUrl] = useState<string | null>(null)

    const [frames, setFrames] = useState<Frame[]>([])
    const [framesLoading, setFramesLoading] = useState(true)
    const [effects,setEffects]=useState<Effect[]>([])
    const [balance,setBalance]=useState(0)
    const [effectKey,setEffectKey]=useState<string|null>(null)
    const [bgImage,setBgImage]=useState<string|null>(null)
    const [themes,setThemes]=useState<Theme[]>([])
    const [themeKey,setThemeKey]=useState<string|null>(null)

    const [savingFrame, setSavingFrame] = useState(false)

    const [toast, setToast] = useState<string | null>(null)
    const [activeTab, setActiveTab] = useState<CosmeticTab>('theme')

    // 프로필 사진은 Discord 프로필 전용이다(직접 업로드 제거).
    const displayUrl = isDiscordAvatarUrl(member.discord_avatar_url)
        ? member.discord_avatar_url
        : null

    // 보유 아이템만 렌더한다. 구매는 /shop 에서만.
    const ownedFrames = frames.filter((f) => f.owned)
    const ownedEffects = effects.filter((e) => e.owned)

    useEffect(() => {
        if (!framePath) {
            setFrameUrl(null)
            return
        }
        setFrameUrl(framePublicUrl(framePath))
    }, [framePath])

    useEffect(() => {
        let mounted = true
        ;(async () => {
            setFramesLoading(true)
            const response=await fetch('/api/me/cosmetics',{cache:'no-store'})
            const data:unknown=await response.json().catch(()=>null)

            if (!mounted) return
            if (!response.ok||!data||typeof data!=='object') {
                showToast('보유 아이템을 불러오지 못했습니다.')
                setFrames([])
            } else {
                const shop=data as {frames?:Frame[];effects?:Effect[];themes?:Theme[];balance?:number}
                const equippedEffect=shop.effects?.find(e=>e.equipped)??null
                const equippedTheme=shop.themes?.find(t=>t.equipped)??null
                setFrames(shop.frames??[]);setEffects(shop.effects??[]);setThemes(shop.themes??[]);setBalance(shop.balance??0);setEffectKey(equippedEffect?.effect_key??null);setBgImage(equippedEffect?.image_path??null);setThemeKey(equippedTheme?.key??null)
            }
            setFramesLoading(false)
        })()

        return () => {
            mounted = false
        }
    }, [])

    function showToast(msg: string) {
        setToast(msg)
        setTimeout(() => setToast(null), 2500)
    }

    function framePublicUrl(imagePath: string) {
        return resolveFrameUrl(imagePath,(path)=>`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-frames/${encodeURIComponent(path).replaceAll('%2F','/')}`)
    }

    function bgPublicUrl(imagePath: string) {
        return resolveRankBgUrl(imagePath,(path)=>`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/rank-backgrounds/${encodeURIComponent(path).replaceAll('%2F','/')}`)
    }

    // 보유분만 다루므로 장착/해제(equip)만 호출한다. 구매 경로 없음.
    async function toggleEquip(itemType:'frame'|'rank_effect'|'profile_theme',item:{id:string;equipped:boolean}){
      setSavingFrame(true)
      try{
        const r=await fetch('/api/me/cosmetics/equip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemType,itemId:item.equipped?null:item.id})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error??'장착 실패')
        if(itemType==='frame'){const selected=frames.find(f=>f.id===item.id);setFramePath(item.equipped?null:selected?.image_path??null);setFrames(frames.map(f=>({...f,equipped:f.id===item.id?!item.equipped:false})))}else if(itemType==='profile_theme'){const selected=themes.find(t=>t.id===item.id);setThemeKey(item.equipped?null:selected?.key??null);setThemes(themes.map(t=>({...t,equipped:t.id===item.id?!item.equipped:false})))}else{const selected=effects.find(e=>e.id===item.id);setEffectKey(item.equipped?null:selected?.effect_key??null);setBgImage(item.equipped?null:selected?.image_path??null);setEffects(effects.map(e=>({...e,equipped:e.id===item.id?!item.equipped:false})))}
        showToast('반영됐어요 ✅')
      }catch(e){showToast(e instanceof Error?e.message:'처리 중 오류')}finally{setSavingFrame(false)}
    }

    async function saveFrame(nextFramePath: string | null) {
        setSavingFrame(true)
        try {
            const res = await fetch('/api/profile/frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ framePath: nextFramePath }),
            })
            const data = await res.json().catch(() => ({}))

            if (!res.ok || !data.ok) {
                throw new Error(data.message ?? '프레임 저장에 실패했어요.')
            }

            setFramePath(nextFramePath)
            setFrames(frames.map((f) => ({ ...f, equipped: false })))
            showToast('프레임이 저장됐어요 ✅')
        } catch (e) {
            showToast(e instanceof Error ? e.message : '프레임 저장 중 오류가 발생했어요.')
        } finally {
            setSavingFrame(false)
        }
    }

    const ownedThemes = themes.filter((theme) => theme.owned)
    const tabs: { key: CosmeticTab; label: string; count: number }[] = [
        { key: 'theme', label: '카드 테마', count: ownedThemes.length },
        { key: 'frame', label: '프레임', count: ownedFrames.length },
        { key: 'background', label: '랭킹 배경', count: ownedEffects.length },
    ]

    function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, current: CosmeticTab) {
        const currentIndex = tabs.findIndex((tab) => tab.key === current)
        let nextIndex = currentIndex
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
        else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
        else if (event.key === 'Home') nextIndex = 0
        else if (event.key === 'End') nextIndex = tabs.length - 1
        else return

        event.preventDefault()
        const nextKey = tabs[nextIndex].key
        setActiveTab(nextKey)
        document.getElementById(`cosmetic-tab-${nextKey}`)?.focus()
    }

    return (
        <section className="overflow-hidden rounded-3xl bg-surface ring-1 ring-line shadow-xl">
            <div className={`relative isolate overflow-hidden p-5 sm:p-7 ${profileThemeClass(themeKey)} ${bgImage ? '' : rankEffectClass(effectKey)}`}>
                <RankCardBackground imagePath={bgImage} />
                <div className="flex items-center justify-between gap-5">
                    <div className="relative min-w-0 flex-1">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand-ink">Profile preview</p>
                        <div className="mt-1 truncate text-xl font-black text-fg drop-shadow">{member.member_name}</div>
                        <div className="mt-1 text-sm text-muted">{member.riot_id}</div>
                        <TitleBadges titles={equippedTitles} className="mt-3" />
                    </div>

                    <div className="relative h-20 w-20 shrink-0 sm:h-24 sm:w-24">
                        <div className="absolute inset-0 z-10 overflow-hidden rounded-full bg-surface-2 ring-2 ring-line">
                            {displayUrl ? (
                                <Image src={displayUrl} alt={`${member.member_name} 프로필`} fill sizes="96px" className="object-cover"/>
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted">
                                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                                        <path
                                            d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4v1h14v-1c0-2-3-4-7-4Z"
                                            stroke="currentColor"
                                            strokeWidth="1.7"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                            )}
                        </div>

                        {frameUrl && (
                            <div className="pointer-events-none absolute -inset-[34%] z-20">
                                <Image src={frameUrl} alt="" fill sizes="132px" className={`object-contain ${isSpinningFrame(framePath) ? 'frame-spin' : ''}`} />
                            </div>
                        )}
                    </div>
                </div>

                {toast && (
                    <div className="relative mt-4 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg ring-1 ring-line" role="status">
                        {toast}
                    </div>
                )}
            </div>

            <div className="border-t border-line p-5 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="font-extrabold text-fg">꾸미기</h2>
                        <p className="mt-1 text-xs text-muted">보유 아이템을 골라 바로 장착할 수 있어요.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-black text-brand-ink">{balance.toLocaleString()}P</span>
                        <Link href="/shop" className="min-h-10 rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand/85">상점</Link>
                    </div>
                </div>

                <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1" role="tablist" aria-label="꾸미기 종류">
                    {tabs.map((tab) => (
                        <button
                            key={tab.key}
                            id={`cosmetic-tab-${tab.key}`}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.key}
                            aria-controls={`cosmetic-panel-${tab.key}`}
                            tabIndex={activeTab === tab.key ? 0 : -1}
                            onClick={() => setActiveTab(tab.key)}
                            onKeyDown={(event) => handleTabKeyDown(event, tab.key)}
                            className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 ${activeTab === tab.key ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-fg'}`}
                        >
                            {tab.label} <span className="opacity-70">{tab.count}</span>
                        </button>
                    ))}
                </div>

                <div
                    id={`cosmetic-panel-${activeTab}`}
                    className="mt-5"
                    role="tabpanel"
                    aria-labelledby={`cosmetic-tab-${activeTab}`}
                >
                    {framesLoading ? <div className="py-8 text-center text-sm text-muted">보유 아이템을 불러오는 중...</div> : activeTab === 'theme' ? (
                        ownedThemes.length === 0 ? <EmptyOwned label="테마" /> : (
                            <div className="grid gap-3 sm:grid-cols-2">
                                {ownedThemes.map((theme) => <button type="button" key={theme.id} disabled={savingFrame} onClick={() => toggleEquip('profile_theme', theme)} className={`rounded-2xl border p-4 text-left ${theme.equipped ? 'border-brand bg-brand/10' : 'border-line bg-surface-2'}`}><div className={`relative h-16 overflow-hidden rounded-xl ${profileThemeClass(theme.key)}`} /><div className="mt-3 font-bold text-fg">{theme.label}</div><div className="mt-1 text-xs text-muted">{theme.equipped ? '장착 중' : '장착'}</div></button>)}
                            </div>
                        )
                    ) : activeTab === 'frame' ? (
                        ownedFrames.length === 0 ? <EmptyOwned label="프레임" /> : (
                            <>
                                <div className="mb-3 flex justify-end"><button type="button" disabled={savingFrame} onClick={() => saveFrame(null)} className="min-h-10 rounded-xl border border-line bg-surface-2 px-4 text-sm font-bold text-fg disabled:opacity-50">프레임 해제</button></div>
                                <CardCarousel perPage={9} pageClassName="grid grid-cols-2 gap-3 sm:grid-cols-3" items={ownedFrames.map((frame) => {
                                    const selected = framePath === frame.image_path
                                    return <button key={frame.id} type="button" disabled={savingFrame} onClick={() => toggleEquip('frame', frame)} className={`rounded-2xl p-4 text-left ring-1 transition ${selected ? 'bg-amber-500/10 ring-amber-400/60' : 'bg-surface-2 ring-line'}`}><div className="flex items-center gap-3"><div className="relative h-12 w-12 shrink-0"><Image src={framePublicUrl(frame.image_path)} alt={frame.label} fill sizes="48px" className={`object-contain ${isSpinningFrame(frame.image_path) ? 'frame-spin' : ''}`} /></div><div className="min-w-0"><div className="truncate font-bold text-fg">{frame.label}</div><div className="text-xs text-muted">{selected ? '장착 중' : '장착'}</div></div></div></button>
                                })} />
                            </>
                        )
                    ) : ownedEffects.length === 0 ? <EmptyOwned label="랭킹 배경" /> : (
                        <CardCarousel perPage={9} pageClassName="grid gap-3 sm:grid-cols-3" items={ownedEffects.map((effect) => (
                            <button key={effect.id} type="button" disabled={savingFrame} onClick={() => toggleEquip('rank_effect', effect)} className={`rounded-2xl border p-4 text-left ${effect.equipped ? 'border-brand bg-brand/10' : 'border-line bg-surface-2'} disabled:opacity-40`}><div className={`relative mb-3 h-16 w-full overflow-hidden rounded-xl bg-canvas ring-1 ring-line ${effect.image_path ? '' : rankEffectClass(effect.effect_key)}`} aria-hidden>{effect.image_path && <Image src={bgPublicUrl(effect.image_path)} alt="" fill sizes="200px" className="object-cover" />}</div><div className="flex items-center justify-between gap-2"><div className="truncate font-bold text-fg">{effect.label}</div><div className="shrink-0 text-xs text-muted">{effect.equipped ? '장착 중' : '장착'}</div></div></button>
                        ))} />
                    )}
                    {savingFrame && <div className="mt-4 text-xs text-muted" role="status">저장 중...</div>}
                </div>
            </div>
        </section>
    )
}

function EmptyOwned({ label }: { label: string }) {
    return <div className="rounded-2xl bg-surface-2 px-4 py-8 text-center text-sm text-muted">보유한 {label}가 없어요. <Link href="/shop" className="font-bold text-brand-ink underline">상점에서 보기</Link></div>
}
