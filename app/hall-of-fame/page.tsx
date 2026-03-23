import { supabaseService } from '@/lib/supabase/service';
import HallOfFameClientPage from './_components/HallOfFameClientPage';
import { Season, HallOfFame, Member } from '@/types/supabase';

export default async function HallOfFamePage({
                                               searchParams,
                                             }: {
  searchParams: Promise<{ season?: string; queue?: 'solo' | 'doubleup' }>;
}) {
  // 1. 비동기 파라미터 추출
  const params = await searchParams;
  const seasonParam = params.season;
  const currentQueue = params.queue || 'solo';

  // 2. 시즌 목록 가져오기
  const { data: seasons } = await supabaseService
  .from('seasons')
  .select('*')
  .order('set_number', { ascending: false });

  if (!seasons || seasons.length === 0) return <div className="text-white p-10">시즌 정보가 없습니다.</div>;

  // 3. 현재 시즌 확정
  const currentSeasonId = seasonParam ? parseInt(seasonParam) : seasons[0].id;
  const currentSeason = seasons.find((s) => s.id === currentSeasonId) || seasons[0];

  // 4. 해당 시즌 + 큐 타입 데이터 가져오기
  const { data: allRankers } = await supabaseService
  .from('hall_of_fame')
  .select(`*, members(member_name, profile_image_path)`)
  .eq('season_id', currentSeasonId)
  .eq('queue_type', currentQueue)
  .order('lp', { ascending: false });

  const top3 = allRankers?.slice(0, 3) || [];

  // ✅ UI 제어는 클라이언트 컴포넌트로 넘깁니다.
  return (
      <HallOfFameClientPage
          seasons={seasons}
          currentSeason={currentSeason}
          currentQueue={currentQueue}
          top3={top3}
      />
  );
}