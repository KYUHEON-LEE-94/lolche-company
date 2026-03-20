import { supabaseService } from '@/lib/supabase/service';
import HallOfFameCard from '@/app/components/ranking/HallOfFameCard';
import { Season, HallOfFame, Member } from '@/types/supabase';
import Link from 'next/link'; // ✅ 링크 이동을 위해 추가

type RankerWithMember = HallOfFame & {
    members: Pick<Member, 'member_name' | 'profile_image_path'> | null;
};

export default async function HallOfFamePage({
                                                 searchParams, // 타입 정의는 Next.js가 자동으로 해주지만, 명시하고 싶다면 아래와 같이 합니다.
                                             }: {
    searchParams: Promise<{ season?: string; queue?: 'solo' | 'doubleup' }>;
}) {
    // 🔥 1. searchParams를 await로 먼저 풀어줘야 합니다.
    const params = await searchParams;
    const seasonParam = params.season;
    const currentQueue = params.queue || 'solo';

    // 2. 시즌 목록 가져오기
    const { data: seasonsData } = await supabaseService
        .from('seasons')
        .select('*')
        .order('set_number', { ascending: false });

    const seasons = seasonsData as Season[] | null;

    if (!seasons || seasons.length === 0) {
        return <div className="p-10 text-center text-white">등록된 시즌 정보가 없습니다.</div>;
    }

    // 3. ✅ 이제 'params.season'을 사용하므로 에러가 나지 않습니다.
    const currentSeasonId = seasonParam ? parseInt(seasonParam) : seasons[0].id;
    const currentSeason = seasons.find(s => s.id === currentSeasonId) || seasons[0];

    // 4. 해당 시즌 데이터 가져오기 (queue_type 필터 포함)
    let rankers: RankerWithMember[] = [];

    if (currentSeasonId) {
        const { data: rankersData, error: rankersError } = await supabaseService
            .from('hall_of_fame')
            .select(`*, members(member_name, profile_image_path)`)
            .eq('season_id', currentSeasonId)
            .eq('queue_type', currentQueue) // 큐 타입 필터
            .order('lp', { ascending: false })
            .limit(3);

        if (!rankersError && rankersData) {
            rankers = rankersData as RankerWithMember[];
        }
    }

    return (
        <div className="max-w-5xl mx-auto py-12 px-4 text-white">
            <h1 className="text-4xl font-extrabold text-center mb-4 bg-gradient-to-r from-yellow-400 to-orange-500 bg-clip-text text-transparent uppercase tracking-tighter">
                {currentSeason.season_name} Hall of Fame
            </h1>
            <p className="text-center text-slate-400 mb-10 text-sm">
                Set {currentSeason.set_number}의 정점에 섰던 플레이어들을 기록합니다.
            </p>

            {/* 큐 타입 선택 (솔로 / 더블업) */}
            <div className="flex justify-center mb-6">
                <div className="bg-gray-800/50 p-1 rounded-xl border border-gray-700 inline-flex gap-1">
                    <Link
                        href={`/hall-of-fame?season=${currentSeasonId}&queue=solo`}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                            currentQueue === 'solo' ? 'bg-amber-500 text-black shadow-lg' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        솔로 랭크
                    </Link>
                    <Link
                        href={`/hall-of-fame?season=${currentSeasonId}&queue=doubleup`}
                        className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                            currentQueue === 'doubleup' ? 'bg-amber-500 text-black shadow-lg' : 'text-gray-400 hover:text-white'
                        }`}
                    >
                        더블업 랭크
                    </Link>
                </div>
            </div>

            {/* 2. 시즌 선택기 */}
            <div className="flex justify-center mb-12">
                <select
                    className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                    defaultValue={currentSeasonId}
                >
                    {seasons?.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.season_name} (Set {s.set_number})
                        </option>
                    ))}
                </select>
            </div>

            {/* 3. 포디움 레이아웃 */}
            <div className="flex flex-col md:flex-row items-center md:items-end justify-center gap-8 md:gap-4 min-h-[400px]">
                {rankers && rankers.length > 0 ? (
                    <>
                        {/* 2위 */}
                        {rankers[1] && (
                            <div className="order-2 md:order-1 transform md:translate-y-4">
                                <HallOfFameCard ranker={rankers[1]} position={2} />
                            </div>
                        )}

                        {/* 1위 */}
                        {rankers[0] && (
                            <div className="order-1 md:order-2 mb-10 scale-110 z-10">
                                <HallOfFameCard ranker={rankers[0]} position={1} />
                            </div>
                        )}

                        {/* 3위 */}
                        {rankers[2] && (
                            <div className="order-3 md:order-3 transform md:translate-y-8">
                                <HallOfFameCard ranker={rankers[2]} position={3} />
                            </div>
                        )}
                    </>
                ) : (
                    /* 데이터가 없을 때의 안내 문구에 currentSeason 활용 */
                    <div className="mt-10 text-center py-16 border-2 border-dashed border-gray-800 rounded-3xl w-full">
                        <p className="text-gray-500">
                            <span className="text-amber-500 font-bold">{currentSeason.season_name}</span>의
                            {currentQueue === 'solo' ? ' 솔로 랭크 ' : ' 더블업 랭크 '}
                            명예의 전당 데이터가 아직 등록되지 않았습니다.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}