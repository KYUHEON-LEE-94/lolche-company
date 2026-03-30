'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';

// ─────────────────────────────────────────────────────────────────────────────
// 순위별 설정: 이제 'rank'는 display_rank를 의미합니다.
// ─────────────────────────────────────────────────────────────────────────────
const RANK_CONFIG = {
    1: {
        frameImg: '/images/hall-of-fame/hall-of-fame_1st.png',
        frameW: 280,
        isFirst: true,
        profilePos: 'top-[17.5%] left-[17.5%] w-[65%] h-[65%]',
        tierColor: 'text-amber-400',
        pedestalBg: 'from-amber-900/20 to-slate-900/90',
        pedestalBorder: 'border-amber-500/30',
    },
    2: {
        frameImg: '/images/hall-of-fame/hall-of-fame_2nd.png',
        frameW: 240,
        isFirst: false,
        profilePos: 'top-[19%] left-[19%] w-[62%] h-[62%]',
        tierColor: 'text-slate-300',
        pedestalBg: 'from-slate-800/20 to-slate-900/90',
        pedestalBorder: 'border-slate-500/30',
    },
    3: {
        frameImg: '/images/hall-of-fame/hall-of-fame_3rd.png',
        frameW: 240,
        isFirst: false,
        profilePos: 'top-[19%] left-[19%] w-[62%] h-[62%]',
        tierColor: 'text-orange-500',
        pedestalBg: 'from-orange-900/20 to-slate-900/90',
        pedestalBorder: 'border-orange-700/30',
    },
} as const;

// ─── 개별 카드 컴포넌트 ────────────────────────────────────────────────────────
// position: 1(중앙), 2(왼쪽), 3(오른쪽) 배치를 결정
function PodiumCard({ data, delay, position }: { data: any; delay: number; position: number }) {
    // ✅ 서버에서 넘겨준 display_rank를 기준으로 설정을 가져옵니다. (최대 3위까지만 프레임 적용)
    const displayRank = data.display_rank;
    const configRank = Math.min(displayRank, 3) as 1 | 2 | 3;
    const cfg = RANK_CONFIG[configRank];

    const profileImg = data.members?.profile_image_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${data.members.profile_image_path}`
        : '/images/logo.png';

    // 단상 높이 조절 (실제 순위가 아닌 포디움의 시각적 위치에 따름)
    const pedestalH = position === 1 ? 'h-24' : position === 2 ? 'h-16' : 'h-12';
    // 중앙 배치 여부에 따른 Y축 오프셋
    const translateCls = position === 1 ? 'z-20 md:-translate-y-12' : 'z-10';
    // Flex order 설정 (2nd - 1st - 3rd 순서 유지)
    const orderCls = position === 1 ? 'md:order-2' : position === 2 ? 'md:order-1' : 'md:order-3';

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.8, ease: "easeOut" }}
            className={`flex flex-col items-center ${orderCls} ${translateCls}`}
        >
            {/* ── 프레임 & 프로필 레이어 ── */}
            <div className="relative group mb-2" style={{ width: cfg.frameW, height: cfg.frameW }}>
                <div className={`absolute ${cfg.profilePos} rounded-full overflow-hidden z-0`}>
                    <img
                        src={profileImg}
                        alt={data.members?.member_name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                </div>
                <div className="absolute inset-0 z-10 pointer-events-none">
                    <Image src={cfg.frameImg} alt={`Rank ${displayRank}`} fill className="object-contain" />
                </div>
                <div className="absolute inset-0 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0 blur-xl" />
            </div>

            {/* ── 이름 + 정보 ── */}
            <div className="flex flex-col items-center gap-1 text-center px-4 mb-6 z-30">
                <h3 className="text-xl font-black text-white line-clamp-2 break-keep min-h-[3rem] flex items-center justify-center drop-shadow-lg">
                    {data.members?.member_name}
                </h3>
                <span className={`text-[10px] font-black px-3 py-1 rounded-lg bg-black/60 border border-white/10 uppercase tracking-widest ${cfg.tierColor}`}>
                    {data.tier} {data.rank}
                </span>
                <span className="text-[11px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                    {data.lp.toLocaleString()} LP
                </span>
            </div>

            {/* ── 단상 (Pedestal) ── */}
            <div className={`relative w-56 ${pedestalH} bg-gradient-to-b ${cfg.pedestalBg} border-t-2 ${cfg.pedestalBorder} rounded-t-3xl hidden md:flex items-end justify-center overflow-hidden`}>
                <span className="absolute -bottom-4 text-8xl font-black text-white/5 italic select-none">
                    {displayRank}
                </span>
            </div>
        </motion.div>
    );
}

// ─── 메인 포디엄 컴포넌트 ──────────────────────────────────────────────────────
export default function Podium({ top3 }: { top3: any[] }) {
    const [showContent, setShowContent] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setShowContent(true), 500);
        return () => clearTimeout(t);
    }, []);

    // 화면 배치 가이드 (배열 인덱스 기준)
    // idx 0: 1등 후보 (중앙)
    // idx 1: 2등 후보 (왼쪽)
    // idx 2: 3등 후보 (오른쪽)
    const layout = [
        {idx: 1, pos: 2, delay: 0.5}, // 왼쪽
        {idx: 0, pos: 1, delay: 0.2}, // 중앙
        {idx: 2, pos: 3, delay: 0.7}, // 오른쪽
    ];

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[600px] overflow-visible">
            <div
                className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[120%] h-40 bg-amber-500/5 blur-[100px] pointer-events-none"/>

            <div
                className="flex flex-col md:flex-row items-center md:items-end justify-center gap-6 md:gap-4 w-full px-4 z-10">
                {showContent && layout.map(({idx, pos, delay}) => {
                    const data = top3[idx];
                    if (!data) return <div key={pos} className="hidden md:block" style={{width: 240}}/>;
                    return <PodiumCard key={data.id} data={data} delay={delay} position={pos}/>;
                })}
            </div>

            <div
                className="absolute bottom-20 w-full max-w-4xl h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"/>
        </div>
    );
}