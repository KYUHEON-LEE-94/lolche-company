import { supabaseService } from '@/lib/supabase/service';
import HallOfFameClientPage from './_components/HallOfFameClientPage';
import { unstable_noStore as noStore } from 'next/cache';
import { TIER_ORDER, RANK_ORDER } from '@/lib/constants/tierOrder';

export default async function HallOfFamePage({
                                                 searchParams,
                                             }: {
    searchParams: Promise<{ season?: string; queue?: 'solo' | 'doubleup' }>;
}) {
    noStore(); // 실시간 데이터 반영을 위해 캐시 방지

    const params = await searchParams;
    const seasonParam = params.season;
    const currentQueue = params.queue || 'solo';

    // 2. 시즌 목록 가져오기
    const { data: seasons } = await supabaseService
        .schema("public")
        .from('seasons')
        .select('*')
        .order('set_number', { ascending: false });

    if (!seasons || seasons.length === 0) return <div className="text-white p-10">시즌 정보가 없습니다.</div>;

    const currentSeasonId = seasonParam ? parseInt(seasonParam) : seasons[0].id;
    const currentSeason = seasons.find((s) => s.id === currentSeasonId) || seasons[0];

    // 3. 해당 시즌 데이터 가져오기
    const { data: rawRankers } = await supabaseService
        .schema("public")
        .from('hall_of_fame')
        .select(`*, members(member_name, profile_image_path)`)
        .eq('season_id', currentSeasonId)
        .eq('queue_type', currentQueue);

    // 4. 공동 순위 계산 로직 적용
    // A. 먼저 티어 > 랭크 > LP 순으로 정렬합니다.
    const sorted = (rawRankers || []).sort((a, b) => {
        const tierA = TIER_ORDER[a.tier?.toUpperCase() ?? ''] ?? 999;
        const tierB = TIER_ORDER[b.tier?.toUpperCase() ?? ''] ?? 999;
        if (tierA !== tierB) return tierA - tierB;

        const rankA = RANK_ORDER[a.rank ?? ''] ?? 999;
        const rankB = RANK_ORDER[b.rank ?? ''] ?? 999;
        if (rankA !== rankB) return rankA - rankB;

        return (b.lp || 0) - (a.lp || 0);
    });

    // B. 공동 순위(display_rank) 부여 (1-2-2-4 방식) — reduce로 순수 함수적으로 처리
    type RankerWithRank = (typeof sorted)[0] & { display_rank: number }
    const allRankers = sorted.reduce<RankerWithRank[]>((acc, item, index) => {
        const displayRank = index === 0
            ? 1
            : (() => {
                const prev = sorted[index - 1]
                const prevResult = acc[index - 1]
                const isSameScore = prev.tier === item.tier && prev.rank === item.rank && prev.lp === item.lp
                return isSameScore ? prevResult.display_rank : index + 1
            })()
        return [...acc, { ...item, display_rank: displayRank }]
    }, []);

    // 상위 3개 요소 추출 (공동 순위여도 포디움에는 상위 3개 데이터가 들어감)
    const top3 = allRankers.slice(0, 3);

    return (
        <HallOfFameClientPage
            seasons={seasons}
            currentSeason={currentSeason}
            currentQueue={currentQueue}
            top3={top3}
            allRankers={allRankers} // 전체 리스트 전달
        />
    );
}