'use client';

import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 핵심 구조:
//   [컨테이너] (relative, 프레임 크기)
//     ├─ [프로필 원] (absolute, z-0) ← 프레임 구멍 위치에 맞춰 배치
//     └─ [프레임 PNG] (absolute inset-0, z-10, pointer-events-none) ← 위에 덮음
//
// profileHole: 프레임 PNG 내부 원형 투명 영역 위치 (실측 기준)
//   - top/left/size: 프레임 이미지 크기 대비 % 값
//   - 프레임 이미지마다 구멍 위치가 다를 수 있으므로 순위별로 분리
// ─────────────────────────────────────────────────────────────────────────────

const RANK_CONFIG = {
    1: {
        frameImg:      '/hall-of-fame/hall-of-fame_1st.png',
        frameW:        200,
        ringGradient:  'from-yellow-300 via-amber-400 to-yellow-600',
        glowColor:     '#f59e0b',
        glowIntensity: 30,
        order:         'md:order-2',
        crownEmoji:    '👑',
        tierColor:     'text-amber-400',
        lpColor:       'text-amber-300/70',
        badgeBg:       'bg-amber-500/90 border-amber-400/60',
        badgeText:     'text-white',
        nameFontSize:  'text-xl',
        // 단상
        pedestalH:     'h-28',
        pedestalTopLine:   'from-amber-300 via-amber-400 to-amber-300',
        pedestalBg:    'from-amber-950/60 via-slate-900/80 to-slate-900/90',
        pedestalBorder:'border-amber-500/20',
        pedestalGlow:  '#f59e0b22',
        pedestalNum:   '1',
        pedestalNumColor: 'text-amber-500/30',
    },
    2: {
        frameImg:      '/hall-of-fame/hall-of-fame_2nd.png',
        frameW:        160,
        ringGradient:  'from-slate-300 via-gray-200 to-slate-400',
        glowColor:     '#94a3b8',
        glowIntensity: 18,
        order:         'md:order-1',
        crownEmoji:    '',
        tierColor:     'text-slate-400',
        lpColor:       'text-slate-500',
        badgeBg:       'bg-slate-700/90 border-slate-500/60',
        badgeText:     'text-slate-200',
        nameFontSize:  'text-lg',
        // 단상
        pedestalH:     'h-16',
        pedestalTopLine:   'from-slate-400 via-slate-300 to-slate-400',
        pedestalBg:    'from-slate-700/40 via-slate-900/80 to-slate-900/90',
        pedestalBorder:'border-slate-500/20',
        pedestalGlow:  '#94a3b822',
        pedestalNum:   '2',
        pedestalNumColor: 'text-slate-500/30',
    },
    3: {
        frameImg:      '/hall-of-fame/hall-of-fame_3rd.png',
        frameW:        160,
        ringGradient:  'from-orange-400 via-amber-600 to-orange-700',
        glowColor:     '#c2410c',
        glowIntensity: 18,
        order:         'md:order-3',
        crownEmoji:    '',
        tierColor:     'text-orange-500',
        lpColor:       'text-orange-600/70',
        badgeBg:       'bg-orange-900/90 border-orange-600/60',
        badgeText:     'text-orange-200',
        nameFontSize:  'text-lg',
        // 단상
        pedestalH:     'h-10',
        pedestalTopLine:   'from-orange-600 via-orange-400 to-orange-600',
        pedestalBg:    'from-orange-950/40 via-slate-900/80 to-slate-900/90',
        pedestalBorder:'border-orange-700/20',
        pedestalGlow:  '#c2410c22',
        pedestalNum:   '3',
        pedestalNumColor: 'text-orange-700/30',
    },
} as const;

// ─── 카드 ─────────────────────────────────────────────────────────────────────
function PodiumCard({
                        rank,
                        data,
                        visible,
                    }: {
    rank: 1 | 2 | 3;
    data: any;
    visible: boolean;
}) {
    const cfg = RANK_CONFIG[rank];

    const rankImgMap = {
        1: '/hall-of-fame/hall-of-fame_1st.png',
        2: '/hall-of-fame/hall-of-fame_2nd.png',
        3: '/hall-of-fame/hall-of-fame_3rd.png',
    };

    const profileImg = data.members?.profile_image_path
        ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/profile-images/${data.members.profile_image_path}`
        : rankImgMap[rank];

    return (
        <div
            className={`
        flex flex-col items-center
        ${cfg.order}
        transition-all duration-700 ease-out
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
      `}
        >
            {/* 왕관 자리 */}
            <div className="h-9 flex items-end justify-center mb-1">
                {cfg.crownEmoji && (
                    <span
                        className="text-3xl leading-none select-none"
                        style={{ animation: 'bounce 2.4s ease-in-out infinite' }}
                    >
            {cfg.crownEmoji}
          </span>
                )}
            </div>

            {/* ── 원형 링 + 이미지 ── */}
            <div className="relative group">
                <div
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                        background: `radial-gradient(circle, ${cfg.glowColor}55 0%, transparent 70%)`,
                        transform: 'scale(1.4)',
                        filter: 'blur(24px)',
                    }}
                />
                <div
                    className={`relative rounded-full p-[6px] bg-gradient-to-br ${cfg.ringGradient}`}
                    style={{
                        width:  cfg.frameW,
                        height: cfg.frameW,
                        boxShadow: `0 0 ${cfg.glowIntensity}px ${cfg.glowColor}88`,
                    }}
                >
                    <div className="w-full h-full rounded-full overflow-hidden bg-slate-900 relative">
                        <img
                            src={profileImg}
                            alt={data.members?.member_name}
                            className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-105"
                        />
                        <div
                            className="absolute inset-0 rounded-full pointer-events-none"
                            style={{
                                background:
                                    'radial-gradient(ellipse at 42% 25%, rgba(255,255,255,0.15) 0%, transparent 55%)',
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* ── 이름 + 정보 ── */}
            <div className="flex flex-col items-center gap-2 text-center px-3 mt-4 mb-4">
                <h3
                    className={`
            font-black text-white leading-snug
            ${cfg.nameFontSize}
            max-w-[200px] break-keep line-clamp-2
            drop-shadow-[0_1px_8px_rgba(0,0,0,1)]
          `}
                >
                    {data.members?.member_name}
                </h3>
                <span
                    className={`
            text-[11px] font-bold tracking-widest uppercase
            px-3 py-0.5 rounded-full border backdrop-blur-sm
            ${cfg.badgeBg} ${cfg.badgeText}
          `}
                >
          {data.tier} {data.rank}
        </span>
                <span className={`text-xs font-semibold ${cfg.lpColor}`}>
          {data.lp.toLocaleString()} LP
        </span>
            </div>

            {/* ── 단상 ── */}
            <div
                className={`
          relative w-48 ${cfg.pedestalH} overflow-hidden
          rounded-t-xl border-t border-x ${cfg.pedestalBorder}
          bg-gradient-to-b ${cfg.pedestalBg}
        `}
                style={{ boxShadow: `inset 0 1px 0 ${cfg.pedestalGlow}, inset 0 0 30px ${cfg.pedestalGlow}` }}
            >
                {/* 상단 하이라이트 라인 */}
                <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r ${cfg.pedestalTopLine} opacity-60`} />
                {/* 내부 순위 숫자 워터마크 */}
                <div className={`absolute inset-0 flex items-center justify-center text-6xl font-black ${cfg.pedestalNumColor} select-none`}>
                    {cfg.pedestalNum}
                </div>
                {/* 좌우 세로 하이라이트 */}
                <div className="absolute top-0 left-3 w-px h-full bg-gradient-to-b from-white/10 to-transparent" />
                <div className="absolute top-0 right-3 w-px h-full bg-gradient-to-b from-white/10 to-transparent" />
            </div>
        </div>
    );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────
export default function Podium({ top3 }: { top3: any[] }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => setVisible(true), 80);
        return () => clearTimeout(t);
    }, []);

    const layout: Array<{ rank: 1 | 2 | 3; idx: number }> = [
        { rank: 2, idx: 1 },
        { rank: 1, idx: 0 },
        { rank: 3, idx: 2 },
    ];

    return (
        <div className="relative flex flex-col items-center pt-12 pb-10 overflow-hidden">
            {/* 앰비언트 배경 */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[200px] rounded-full bg-amber-500/5 blur-[100px]" />
            </div>

            {/* 헤더 */}
            <div className="flex items-center gap-3 mb-10 z-10">
                <div className="h-px w-16 bg-gradient-to-r from-transparent to-amber-500/40" />
                <span className="text-[10px] font-black tracking-[0.3em] text-amber-500/50 uppercase select-none">
          Hall of Fame
        </span>
                <div className="h-px w-16 bg-gradient-to-l from-transparent to-amber-500/40" />
            </div>

            {/* 포디엄 카드들 — items-end로 단상 높이 차이 자연 정렬 */}
            <div className="flex flex-col md:flex-row items-center md:items-end justify-center gap-8 md:gap-0 z-10 w-full px-4">
                {layout.map(({ rank, idx }) => {
                    const data = top3[idx];
                    if (!data) return <div key={rank} className="hidden md:block" style={{ width: RANK_CONFIG[rank].frameW }} />;
                    return <PodiumCard key={rank} rank={rank} data={data} visible={visible} />;
                })}
            </div>

            {/* 하단 구분선 */}
            <div className="mt-10 w-full max-w-lg pointer-events-none">
                <div className="h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            </div>
        </div>
    );
}
