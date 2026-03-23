'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';

// ─────────────────────────────────────────────────────────────────────────────
// 순위별 설정: 프레임 경로, 크기, 프로필 위치(구멍 위치)를 정의합니다.
// ─────────────────────────────────────────────────────────────────────────────
const RANK_CONFIG = {
    1: {
        frameImg: '/images/hall-of-fame/hall-of-fame_1st.png',
        frameW: 280, // 1등은 더 크게
        order: 'md:order-2',
        isFirst: true,
        // 프레임 구멍 위치 미세조정 (top, left, width, height %)
        profilePos: 'top-[17.5%] left-[17.5%] w-[65%] h-[65%]',
        tierColor: 'text-amber-400',
        pedestalH: 'h-24',
        pedestalBg: 'from-amber-900/20 to-slate-900/90',
        pedestalBorder: 'border-amber-500/30',
    },
    2: {
        frameImg: '/images/hall-of-fame/hall-of-fame_2nd.png',
        frameW: 240,
        order: 'md:order-1',
        isFirst: false,
        profilePos: 'top-[19%] left-[19%] w-[62%] h-[62%]',
        tierColor: 'text-slate-300',
        pedestalH: 'h-16',
        pedestalBg: 'from-slate-800/20 to-slate-900/90',
        pedestalBorder: 'border-slate-500/30',
    },
    3: {
        frameImg: '/images/hall-of-fame/hall-of-fame_3rd.png',
        frameW: 240,
        order: 'md:order-3',
        isFirst: false,
        profilePos: 'top-[19%] left-[19%] w-[62%] h-[62%]',
        tierColor: 'text-orange-500',
        pedestalH: 'h-12',
        pedestalBg: 'from-orange-900/20 to-slate-900/90',
        pedestalBorder: 'border-orange-700/30',
    },
} as const;

// ─── 개별 카드 컴포넌트 ────────────────────────────────────────────────────────
function PodiumCard({ rank, data, delay }: { rank: 1 | 2 | 3; data: any; delay: number }) {
    const cfg = RANK_CONFIG[rank];

    const profileImg = data.members?.profile_image_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${data.members.profile_image_path}`
        : '/images/logo.png';

    return (
        <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.8, ease: "easeOut" }}
            className={`flex flex-col items-center ${cfg.order} ${cfg.isFirst ? 'z-20 md:-translate-y-8' : 'z-10'}`}
        >
            {/* ── 프레임 & 프로필 레이어 ── */}
            <div
                className="relative group mb-2"
                style={{ width: cfg.frameW, height: cfg.frameW }}
            >
                {/* 1. 뒤에 깔리는 프로필 이미지 (원형) */}
                <div className={`absolute ${cfg.profilePos} rounded-full overflow-hidden z-0`}>
                    <img
                        src={profileImg}
                        alt={data.members?.member_name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                </div>

                {/* 2. 위에 덮이는 프레임 PNG */}
                <div className="absolute inset-0 z-10 pointer-events-none">
                    <Image
                        src={cfg.frameImg}
                        alt={`Rank ${rank}`}
                        fill
                        className="object-contain"
                    />
                </div>

                {/* 3. 광채 효과 (선택사항) */}
                <div className="absolute inset-0 rounded-full bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-0 blur-xl" />
            </div>

            {/* ── 이름 + 정보 ── */}
            <div className="flex flex-col items-center gap-1 text-center px-4 mb-6 z-30">
                <h3 className="text-xl font-black text-white line-clamp-2 break-keep min-h-[3rem] flex items-center justify-center drop-shadow-lg">
                    {data.members?.member_name}
                </h3>
                <span className={`text-xs font-bold px-3 py-0.5 rounded-full bg-black/60 border border-white/10 ${cfg.tierColor}`}>
                    {data.tier} {data.rank}
                </span>
                <span className="text-[11px] font-bold text-slate-500 mt-1 uppercase tracking-tighter">
                    {data.lp.toLocaleString()} LP
                </span>
            </div>

            {/* ── 단상 (Pedestal) ── */}
            <div
                className={`
                    relative w-56 ${cfg.pedestalH} 
                    bg-gradient-to-b ${cfg.pedestalBg}
                    border-t-2 ${cfg.pedestalBorder} rounded-t-3xl
                    hidden md:flex items-end justify-center overflow-hidden
                `}
            >
                <span className="absolute -bottom-4 text-7xl font-black text-white/5 italic select-none">
                    {rank}
                </span>
            </div>
        </motion.div>
    );
}

// ─── 메인 포디엄 컴포넌트 ──────────────────────────────────────────────────────
export default function Podium({ top3 }: { top3: any[] }) {
    // 인트로 상태 관리 (필요 시 상위 페이지에서 관리하도록 수정 가능)
    const [showContent, setShowContent] = useState(false);

    useEffect(() => {
        // 인트로 후 0.5초 뒤에 카드가 나타나게 설정
        const t = setTimeout(() => setShowContent(true), 500);
        return () => clearTimeout(t);
    }, []);

    const layout = [
        { rank: 2 as const, idx: 1, delay: 0.4 },
        { rank: 1 as const, idx: 0, delay: 0.2 },
        { rank: 3 as const, idx: 2, delay: 0.6 },
    ];

    return (
        <div className="relative flex flex-col items-center justify-center min-h-[600px] overflow-visible">
            {/* 앰비언트 라이트 (바닥 광원) */}
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[120%] h-40 bg-amber-500/5 blur-[100px] pointer-events-none" />

            {/* 카드 렌더링 영역 */}
            <div className="flex flex-col md:flex-row items-center md:items-end justify-center gap-6 md:gap-2 w-full px-4 z-10">
                {showContent && layout.map(({ rank, idx, delay }) => {
                    const data = top3[idx];
                    if (!data) return <div key={rank} className="hidden md:block" style={{ width: 240 }} />;
                    return <PodiumCard key={rank} rank={rank} data={data} delay={delay} />;
                })}
            </div>

            {/* 바닥 수평선 가이드 */}
            <div className="absolute bottom-20 w-full max-w-4xl h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
    );
}