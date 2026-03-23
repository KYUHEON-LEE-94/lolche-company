'use client'

import { motion } from 'framer-motion';
import Image from 'next/image';

export default function HallOfFameIntro({ onFinish }: { onFinish: () => void }) {
  return (
      <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black flex items-center justify-center overflow-hidden"
      >
        {/* 웅장한 일러스트 배경 */}
        <motion.div
            initial={{ scale: 1.2, filter: 'blur(10px)' }}
            animate={{ scale: 1, filter: 'blur(0px)' }}
            transition={{ duration: 2, ease: "easeOut" }}
            className="absolute inset-0 opacity-60"
        >
          <Image
              src="/images/hall-of-fame/hall-of-fame-intro.png" // KakaoTalk 일러스트 이미지 경로
              alt="Hall of Fame Intro"
              fill
              className="object-cover"
          />
        </motion.div>

        {/* 중앙 텍스트 애니메이션 */}
        <div className="relative text-center z-10">
          <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 1 }}
              className="text-amber-400 text-xl font-bold tracking-[0.5em] mb-4"
          >
            THE LEGENDS OF TFT
          </motion.h2>
          <motion.h1
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.8, duration: 1.2, type: "spring" }}
              className="text-7xl md:text-9xl font-black italic text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]"
          >
            HALL OF FAME
          </motion.h1>

          <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2.5 }}
              onClick={onFinish}
              className="mt-12 px-10 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black rounded-full hover:scale-110 transition-transform shadow-[0_0_20px_rgba(245,158,11,0.5)]"
          >
            기록 확인하기
          </motion.button>
        </div>

        {/* 하단 화려한 입자 효과 (CSS로 추가 가능) */}
        <div className="absolute inset-0 pointer-events-none bg-[url('/images/particles.png')] opacity-20 mix-blend-screen animate-pulse" />
      </motion.div>
  );
}