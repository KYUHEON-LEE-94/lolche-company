'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Podium from './Podium';
import SeasonTab from './SeasonTab';

// ✅ allRankers 프롭을 추가로 받습니다.
export default function HallOfFameClientPage({ seasons, currentSeason, currentQueue, top3, allRankers = [] }: any) {
    const [showIntro, setShowIntro] = useState(true);

    // 4위부터의 명단만 추출
    const otherRankers = allRankers.slice(3);

    return (
        <div className="bg-[#050505] min-h-screen text-white overflow-x-hidden">
            {/* 🎬 웅장한 인트로 레이어 (기존과 동일) */}
            <AnimatePresence>
                {showIntro && (
                    <motion.div
                        initial={{ opacity: 1 }}
                        exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
                        transition={{ duration: 1.2, ease: 'easeInOut' }}
                        className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
                    >
                        <div className="absolute inset-0 opacity-40">
                            <img src="/images/hall-of-fame/hall-of-fame-intro.png" className="w-full h-full object-cover" alt="Intro" />
                        </div>
                        <div className="relative z-10 text-center">
                            <motion.h2 className="text-amber-500 font-bold tracking-[0.4em] mb-4">롤체 컴퍼니</motion.h2>
                            <motion.h1 className="text-7xl md:text-9xl font-black italic mb-12 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">명예의 전당</motion.h1>
                            <motion.button onClick={() => setShowIntro(false)} className="px-12 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black rounded-full shadow-[0_0_20px_rgba(245,158,11,0.4)]">기록 확인하기</motion.button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 🏛️ 실제 컨텐츠 영역 */}
            <motion.main
                initial={{ opacity: 0 }}
                animate={{ opacity: showIntro ? 0 : 1 }}
                transition={{ duration: 1 }}
                className="max-w-6xl mx-auto px-4 py-16"
            >
                <header className="text-center mb-16">
                    <h1 className="text-5xl font-black italic tracking-tighter mb-2 bg-gradient-to-b from-amber-200 to-amber-700 bg-clip-text text-transparent uppercase">
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
                    {top3.length > 0 ? <Podium top3={top3} /> : <div className="text-center py-32 opacity-50 italic">기록이 없습니다.</div>}
                </section>

                {/* ── 🚀 추가: 4위 이하 명단 (리스트 형식) ── */}
                {otherRankers.length > 0 && (
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mt-32 max-w-4xl mx-auto"
                    >
                        <div className="flex items-center gap-4 mb-8">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-800" />
                            <h2 className="text-slate-500 font-black tracking-widest uppercase text-xs">Top Rankers</h2>
                            <div className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-800" />
                        </div>

                        <div className="space-y-3">
                            {otherRankers.map((ranker: any, idx: number) => (
                                <div
                                    key={ranker.id}
                                    className="flex items-center justify-between p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-all group"
                                >
                                    <div className="flex items-center gap-6">
                      <span className="text-xl font-black italic text-slate-700 group-hover:text-slate-400 transition-colors w-8 text-center">
                        {idx + 4}
                      </span>
                                        <div>
                                            <p className="text-lg font-bold text-slate-200">{ranker.members?.member_name}</p>
                                            <p className="text-xs text-slate-600 font-bold uppercase tracking-wider">{ranker.tier} {ranker.rank}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-amber-500/80 font-black tracking-tighter">{ranker.lp.toLocaleString()} LP</p>
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