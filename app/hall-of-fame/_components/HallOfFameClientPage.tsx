'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import Podium, { rankerName, type HallOfFameRanker } from './Podium';
import SeasonTab from './SeasonTab';
import { CARD, CONTAINER, TABBAR_SAFE_PB } from '@/lib/ui/styles';
import EmptyState from '@/app/components/ui/EmptyState';

type Season = { id: number; season_name: string; set_number: number }

type Props = {
    seasons: Season[]
    currentSeason: Season
    currentQueue: string
    top3: HallOfFameRanker[]
    allRankers?: HallOfFameRanker[]
}

export default function HallOfFameClientPage({ seasons, currentSeason, currentQueue, top3, allRankers = [] }: Props) {
    // 4위부터의 명단만 추출
    const otherRankers = allRankers.slice(3);

    return (
        // SHELL 미사용 페이지라 모바일 하단 탭바 여백을 여기서 직접 확보한다.
        <div className={`bg-canvas min-h-[calc(100vh-3.5rem)] text-white overflow-x-hidden ${TABBAR_SAFE_PB}`}>
            {/* 🏛️ 실제 컨텐츠 영역 — 진입 즉시 기록을 보여준다 (인트로 없음) */}
            <motion.main
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.5 }}
                className={`${CONTAINER} px-4 py-12`}
            >
                <header className="text-center mb-12">
                    <p className="mb-3 text-[10px] font-black uppercase tracking-[0.4em] text-amber-500/70">
                        Hall of Fame
                    </p>
                    <h1 className="text-4xl sm:text-5xl font-black italic tracking-tighter mb-2 bg-gradient-to-b from-amber-200 to-amber-700 bg-clip-text text-transparent uppercase">
                        {currentSeason.season_name}
                    </h1>
                    <p className="text-slate-500 tracking-widest uppercase font-bold text-sm">Set {currentSeason.set_number} Champions</p>
                </header>

                {/* 탭 & 시즌탭 (기존과 동일) */}
                <div className="flex justify-center mb-12">
                    <div className="bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 flex gap-2 backdrop-blur-md">
                        {['solo', 'doubleup'].map((q) => (
                            <Link key={q} href={`/hall-of-fame?season=${currentSeason.id}&queue=${q}`} className={`px-8 py-3 rounded-xl text-sm font-black transition-all duration-300 ${currentQueue === q ? (q === 'solo' ? 'bg-amber-400 text-black shadow-lg shadow-orange-500/20' : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20') : 'text-slate-500 hover:text-slate-300'}`}>
                                {q === 'solo' ? '솔로 랭크' : '더블업 랭크'}
                            </Link>
                        ))}
                    </div>
                </div>
                <SeasonTab seasons={seasons} currentId={currentSeason.id} />

                {/* ── 1, 2, 3위 포디움 ── */}
                <section className="mt-20">
                    {top3.length > 0 ? <Podium top3={top3} /> : <EmptyState>기록이 없습니다.</EmptyState>}
                </section>

                {/* ── 🚀 추가: 4위 이하 명단 (리스트 형식) ── */}
                {otherRankers.length > 0 && (
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mt-24 max-w-4xl mx-auto"
                    >
                        <div className="flex items-center gap-4 mb-8">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-800" />
                            <h2 className="text-slate-500 font-black tracking-widest uppercase text-xs">Top Rankers</h2>
                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-800" />
                        </div>

                        <div className="space-y-3">
                            {otherRankers.map((ranker, idx) => (
                                <div
                                    key={ranker.id}
                                    className={`${CARD} flex items-center justify-between p-5 hover:bg-surface-2 transition-colors group`}
                                >
                                    <div className="flex items-center gap-6">
                      <span className="text-xl font-black italic text-slate-700 group-hover:text-slate-400 transition-colors w-8 text-center">
                        {idx + 4}
                      </span>
                                        <div>
                                            <p className="text-lg font-bold text-slate-200">{rankerName(ranker)}</p>
                                            <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">{ranker.tier} {ranker.rank}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-amber-500/80 font-black tracking-tighter">{(ranker.lp ?? 0).toLocaleString()} LP</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.section>
                )}
            </motion.main>
        </div>
    );
}
