'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import Podium from './Podium';
import SeasonTab from './SeasonTab';

export default function HallOfFameClientPage({ seasons, currentSeason, currentQueue, top3 }: any) {
  const [showIntro, setShowIntro] = useState(true);

  return (
      <div className="bg-[#050505] min-h-screen text-white overflow-x-hidden">
        {/* 🎬 웅장한 인트로 레이어 */}
        <AnimatePresence>
          {showIntro && (
              <motion.div
                  initial={{ opacity: 1 }}
                  exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
                  transition={{ duration: 1.2, ease: 'easeInOut' }}
                  className="fixed inset-0 z-[100] flex items-center justify-center bg-black"
              >
                {/* 보내주신 인트로 일러스트 */}
                <div className="absolute inset-0 opacity-40">
                  <img
                      src="/images/hall-of-fame/hall-of-fame-intro.png"
                      className="w-full h-full object-cover"
                      alt="Intro Background"
                  />
                </div>

                <div className="relative z-10 text-center">
                  <motion.h2
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="text-amber-500 font-bold tracking-[0.4em] mb-4"
                  >
                    롤체 컴퍼니
                  </motion.h2>
                  <motion.h1
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.8, duration: 1 }}
                      className="text-7xl md:text-9xl font-black italic mb-12 drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                  >
                    명예의 전당
                  </motion.h1>
                  <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setShowIntro(false)}
                      className="px-12 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black rounded-full shadow-[0_0_20px_rgba(245,158,11,0.4)]"
                  >
                    기록 확인하기
                  </motion.button>
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
            <p className="text-slate-500 tracking-widest uppercase font-bold text-sm">
              Set {currentSeason.set_number} Champions
            </p>
          </header>

          {/* 탭: 솔로 / 더블업 */}
          <div className="flex justify-center mb-12">
            <div className="bg-slate-900/80 p-1.5 rounded-2xl border border-slate-800 flex gap-2 backdrop-blur-md">
              {['solo', 'doubleup'].map((q) => (
                  <Link
                      key={q}
                      href={`/hall-of-fame?season=${currentSeason.id}&queue=${q}`}
                      className={`px-8 py-3 rounded-xl text-sm font-black transition-all duration-300 ${
                          currentQueue === q
                              ? q === 'solo'
                                  ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg shadow-orange-500/20'
                                  : 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/20'
                              : 'text-slate-500 hover:text-slate-300'
                      }`}
                  >
                    {q === 'solo' ? '솔로 랭크' : '더블업 랭크'}
                  </Link>
              ))}
            </div>
          </div>

          <SeasonTab seasons={seasons} currentId={currentSeason.id} />

          <section className="mt-20">
            {top3.length > 0 ? (
                <Podium top3={top3} />
            ) : (
                <div className="text-center py-32 opacity-50 italic">
                  해당 시즌의 기록이 아직 등록되지 않았습니다.
                </div>
            )}
          </section>
        </motion.main>
      </div>
  );
}