'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { isDiscordAvatarUrl } from '@/lib/members/avatar'
import { resolveFrameUrl } from '@/lib/cosmetics/frameUrl'
import { rankEffectClass } from '@/lib/cosmetics/rankEffects'

type Props = {
    userId: string
    member: {
        id: string
        member_name: string
        riot_id: string
        discord_avatar_url: string | null
        profile_frame_path: string | null
        profile_updated_at: string | null
    }
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
type Effect={id:string;label:string;description:string|null;effect_key:string;price_points:number;owned:boolean;equipped:boolean}

export default function ProfileEditor({ member }: Props) {
    // DB 초기값 → state로 복사해서 이후 즉시 반영되게
    const [framePath, setFramePath] = useState<string | null>(member.profile_frame_path)
    const [frameUrl, setFrameUrl] = useState<string | null>(null)

    const [frames, setFrames] = useState<Frame[]>([])
    const [framesLoading, setFramesLoading] = useState(true)
    const [effects,setEffects]=useState<Effect[]>([])
    const [balance,setBalance]=useState(0)
    const [effectKey,setEffectKey]=useState<string|null>(null)

    const [savingFrame, setSavingFrame] = useState(false)

    const [toast, setToast] = useState<string | null>(null)

    // 프로필 사진은 Discord 프로필 전용이다(직접 업로드 제거).
    const displayUrl = isDiscordAvatarUrl(member.discord_avatar_url)
        ? member.discord_avatar_url
        : null
    const avatarNotice = displayUrl
        ? 'Discord 프로필 사진을 사용 중이에요.'
        : 'Discord로 로그인하면 Discord 프로필 사진이 자동으로 사용돼요.'

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
                const shop=data as {frames?:Frame[];effects?:Effect[];balance?:number}
                setFrames(shop.frames??[]);setEffects(shop.effects??[]);setBalance(shop.balance??0);setEffectKey(shop.effects?.find(e=>e.equipped)?.effect_key??null)
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

    // 보유분만 다루므로 장착/해제(equip)만 호출한다. 구매 경로 없음.
    async function toggleEquip(itemType:'frame'|'rank_effect',item:{id:string;equipped:boolean}){
      setSavingFrame(true)
      try{
        const r=await fetch('/api/me/cosmetics/equip',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({itemType,itemId:item.equipped?null:item.id})});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error??'장착 실패')
        if(itemType==='frame'){const selected=frames.find(f=>f.id===item.id);setFramePath(item.equipped?null:selected?.image_path??null);setFrames(frames.map(f=>({...f,equipped:f.id===item.id?!item.equipped:false})))}else{const selected=effects.find(e=>e.id===item.id);setEffectKey(item.equipped?null:selected?.effect_key??null);setEffects(effects.map(e=>({...e,equipped:e.id===item.id?!item.equipped:false})))}
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

    return (
        <div className="grid gap-6">
            {/* 미리보기 카드 */}
            <section className={`relative overflow-hidden rounded-3xl bg-surface ring-1 ring-line p-6 shadow-xl ${rankEffectClass(effectKey)}`}>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="text-lg font-bold text-fg">{member.member_name}</div>
                        <div className="mt-1 text-sm text-muted">{member.riot_id}</div>
                        <div className="mt-2 text-xs text-muted">
                            프로필 사진은 Discord 프로필을 사용해요(프레임은 선택).
                        </div>
                    </div>

                    {/* 아바타 + 프레임 */}
                    <div className="relative h-24 w-24 shrink-0">
                        {/* 프로필 이미지 */}
                        <div
                            className="absolute inset-0 rounded-full overflow-hidden bg-surface-2 ring-2 ring-line z-10">
                            {displayUrl ? (
                                <Image src={displayUrl} alt="profile image" fill className="object-cover"/>
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

                        {/* 프레임 오버레이 */}
                        {frameUrl && (
                            <Image src={frameUrl} alt="profile frame" fill className="object-contain" />
                        )}
                    </div>

                </div>

                {/* 토스트 */}
                {toast && (
                    <div
                        className="mt-4 rounded-2xl bg-surface-2 ring-1 ring-line px-4 py-3 text-sm text-fg">
                        {toast}
                    </div>
                )}
            </section>

            {/* 프로필 이미지 안내 섹션 */}
            <section className="rounded-3xl bg-surface ring-1 ring-line p-6">
                <div className="flex items-center gap-5">
                    <div className="relative w-20 h-20 rounded-full overflow-hidden bg-surface-2 ring-2 ring-line shrink-0">
                        {displayUrl ? (
                            <Image src={displayUrl} alt="avatar preview" fill className="object-cover" />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-muted text-xs">없음</div>
                        )}
                    </div>

                    <div>
                        <div className="text-fg font-extrabold">프로필 사진</div>
                        <div className="mt-1 text-xs text-muted">{avatarNotice}</div>
                    </div>
                </div>
            </section>

            {/* 잔액 + 상점 링크 */}
            <section className="flex items-center justify-between rounded-3xl bg-surface ring-1 ring-line p-5">
                <div>
                    <div className="text-xs text-muted">보유 포인트</div>
                    <div className="mt-0.5 text-xl font-black text-brand-ink">{balance.toLocaleString()}P</div>
                </div>
                <Link href="/shop" className="px-4 py-2 rounded-xl text-sm font-bold bg-brand text-white hover:bg-brand/85 transition">
                    상점 가기
                </Link>
            </section>

            {/* 프레임 선택 섹션 (보유분만) */}
            <section className="rounded-3xl bg-surface ring-1 ring-line p-6">
                <div className="flex items-center justify-between gap-3">
                    <div className="text-fg font-extrabold">프레임</div>
                    <button
                        disabled={savingFrame}
                        onClick={() => saveFrame(null)}
                        className="px-4 py-2 rounded-xl text-sm font-bold bg-surface-2 border border-line text-fg hover:bg-surface disabled:opacity-50"
                    >
                        해제
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {framesLoading ? (
                        <div className="text-xs text-muted">불러오는 중...</div>
                    ) : ownedFrames.length === 0 ? (
                        <div className="col-span-full text-xs text-muted">
                            보유한 프레임이 없어요. <Link href="/shop" className="font-bold text-brand-ink underline">상점에서 구매하기</Link>
                        </div>
                    ) : (
                        ownedFrames.map((f) => {
                            const selected = framePath === f.image_path
                            const url = framePublicUrl(f.image_path)
                            return (
                                <button
                                    key={f.id}
                                    disabled={savingFrame}
                                    onClick={() => toggleEquip('frame',f)}
                                    className={[
                                        'rounded-2xl p-4 ring-1 transition text-left',
                                        selected
                                            ? 'bg-amber-500/10 ring-amber-400/60'
                                            : 'bg-surface-2 ring-line hover:bg-surface',
                                        savingFrame ? 'opacity-50' : '',
                                    ].join(' ')}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative w-12 h-12">
                                            <Image src={url} alt={f.label} fill className="object-contain"/>
                                        </div>
                                        <div>
                                            <div className="text-fg font-bold">{f.label}</div>
                                            <div className="text-xs text-muted">{selected ? '장착 중' : '장착'}</div>
                                        </div>
                                    </div>
                                </button>
                            )
                        })
                    )}
                </div>

                {savingFrame && <div className="mt-4 text-xs text-muted">저장 중...</div>}
            </section>

            {/* 랭킹 카드 배경 (보유분만) */}
            <section className="rounded-3xl bg-surface ring-1 ring-line p-6">
                <div className="text-fg font-extrabold">랭킹 카드 배경</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {ownedEffects.length === 0 ? (
                        <div className="col-span-full text-xs text-muted">
                            보유한 배경이 없어요. <Link href="/shop" className="font-bold text-brand-ink underline">상점에서 구매하기</Link>
                        </div>
                    ) : (
                        ownedEffects.map(e=>(
                            <button key={e.id} disabled={savingFrame} onClick={()=>toggleEquip('rank_effect',e)} className={`rounded-2xl border p-4 text-left ${e.equipped?'border-brand bg-brand/10':'border-line bg-surface-2'} disabled:opacity-40`}>
                                <div className="font-bold text-fg">{e.label}</div>
                                <div className="mt-1 text-xs text-muted">{e.equipped?'장착 중':'장착'}</div>
                                <div className="mt-2 text-[11px] text-subtle">{e.description}</div>
                            </button>
                        ))
                    )}
                </div>
            </section>
        </div>
    )
}
