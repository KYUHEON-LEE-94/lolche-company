import { supabaseService } from '@/lib/supabase/service';
import SeasonTab from './_components/SeasonTab';
import Podium from './_components/Podium';
import Link from 'next/link';

// Next.js 15+ 에서는 searchParams가 Promise입니다.
export default async function HallOfFamePage({
                                                 searchParams,
                                             }: {
    searchParams: Promise<{ season?: string; queue?: 'solo' | 'doubleup' }>;
}) {
    // 1. 파라미터 추출 (await 필수)
    const params = await searchParams;
    const seasonParam = params.season;
    const currentQueue = params.queue || 'solo'; // 기본값은 솔로랭크

    // 2. 모든 시즌 목록 가져오기
    const { data: seasons } = await supabaseService
        .schema("public")
        .from('seasons')
        .select('*')
        .order('set_number', { ascending: false });

    if (!seasons || seasons.length === 0) return <div className="text-white p-10">시즌 정보가 없습니다.</div>;

    // 3. 현재 선택된 시즌 확정
    const currentSeasonId = seasonParam ? parseInt(seasonParam) : seasons[0].id;
    const currentSeason = seasons.find(s => s.id === currentSeasonId) || seasons[0];

    // 4. 해당 시즌 + 선택된 큐(solo/doubleup) 랭커 데이터 가져오기
    const { data: allRankers } = await supabaseService
        .from('hall_of_fame')
        .select(`*, members(member_name, profile_image_path)`)
        .eq('season_id', currentSeasonId)
        .eq('queue_type', currentQueue) // ✅ 큐 타입 필터 추가
        .order('lp', { ascending: false });

    const top3 = allRankers?.slice(0, 3) || [];

    return (
        <main className="max-w-6xl mx-auto px-4 py-16 min-h-screen">

            {/* 헤더 영역 */}
            <header className="text-center mb-12">
                <h1 className="text-6xl font-black italic tracking-tighter mb-4 bg-gradient-to-b from-amber-200 via-amber-500 to-amber-800 bg-clip-text text-transparent">
                    HALL OF FAME
                </h1>
                <p className="text-slate-400 font-medium tracking-widest uppercase">
                    {currentSeason.season_name} — SET {currentSeason.set_number}
                </p>
            </header>

            {/* ✅ 솔로 / 더블업 선택 탭 (Link 사용) */}
            <div className="flex justify-center mb-10">
                <div className="bg-slate-800/50 p-1.5 rounded-2xl border border-slate-700 flex gap-2 backdrop-blur-sm">
                    <Link
                        href={`/hall-of-fame?season=${currentSeasonId}&queue=solo`}
                        className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all duration-300 ${
                            currentQueue === 'solo'
                                ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-lg shadow-orange-500/20 scale-105'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        솔로 랭크
                    </Link>
                    <Link
                        href={`/hall-of-fame?season=${currentSeasonId}&queue=doubleup`}
                        className={`px-8 py-2.5 rounded-xl text-sm font-black transition-all duration-300 ${
                            currentQueue === 'doubleup'
                                ? 'bg-gradient-to-r from-blue-400 to-indigo-500 text-white shadow-lg shadow-indigo-500/20 scale-105'
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        더블업 랭크
                    </Link>
                </div>
            </div>

            {/* 시즌 선택 탭 (SeasonTab 내부에서도 Link를 사용하도록 구현되어야 함) */}
            <div className="mb-16">
                <SeasonTab seasons={seasons} currentId={currentSeasonId} />
            </div>

            {/* 1, 2, 3위 시상대 (데이터가 없을 때 예외처리 추가) */}
            <section className="mb-20">
                {top3.length > 0 ? (
                    <Podium top3={top3} />
                ) : (
                    <div className="text-center py-20 bg-slate-900/40 rounded-3xl border border-dashed border-slate-800">
                        <p className="text-slate-500 font-medium">
                            해당 시즌의 {currentQueue === 'solo' ? '솔로 랭크' : '더블업 랭크'} 기록이 없습니다.
                        </p>
                    </div>
                )}
            </section>

        </main>
    );
}