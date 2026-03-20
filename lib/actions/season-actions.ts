'use server'

import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import { Member, Database } from '@/types/supabase'
import { SupabaseClient } from '@supabase/supabase-js'

// 3) hall_of_fame 테이블에 데이터 삽입 (타입 캐스팅 추가)
type HallOfFameInsert = Database['public']['Tables']['hall_of_fame']['Insert'];


/**
 * 특정 시즌의 현재 랭킹을 스냅샷으로 저장하고 시즌을 마감하는 함수
 */
export async function archiveSeason(seasonId: number, queueType: 'solo' | 'doubleup') {
    const { ok, supabase: rawSupabase } = await requireAdmin()
    const supabase = rawSupabase as SupabaseClient<Database>;

    if (!ok || !supabase) return { ok: false, message: '관리자 권한이 필요합니다.' }

    try {
        // 1) 데이터 가져오기 (전체 다 가져온 후 매핑 시 선택)
        const { data: members, error: fetchError } = await supabase
            .schema("public")
            .from('members')
            .select('*');

        if (fetchError) throw fetchError;

        // 2) 큐 타입에 따른 페이로드 구성
        const archivePayload = members
            .filter(m => {
                // 해당 모드의 티어가 있는 사람만 등록
                return queueType === 'solo' ? m.tft_tier : m.tft_doubleup_tier;
            })
            .map(m => ({
                season_id: seasonId,
                member_id: m.id,
                queue_type: queueType, // ✅ 새로 추가된 컬럼
                tier: queueType === 'solo' ? m.tft_tier : m.tft_doubleup_tier,
                rank: queueType === 'solo' ? m.tft_rank : m.tft_doubleup_rank,
                lp: queueType === 'solo' ? m.tft_league_points : m.tft_doubleup_league_points,
                wins: 0 // 필요 시 wins 데이터도 각 모드에 맞게 확장 필요
            }));

        if (archivePayload.length === 0) {
            return { ok: false, message: `${queueType} 데이터가 없습니다.` }
        }

        // 3) 명예의 전당 저장
        const { error: insertError } = await supabase
            .schema('public')
            .from('hall_of_fame')
            .insert(archivePayload);

        if (insertError) throw insertError;

        // ⚠️ 주의: 시즌 전체 종료(is_active = false)는
        // 솔로와 더블업 둘 다 아카이브된 후에 하는 것이 안전합니다.
        // 여기서는 데이터만 먼저 쌓는 로직으로 처리합니다.

        revalidatePath('/hall-of-fame');
        return { ok: true, message: `${queueType} 명예의 전당 등록 완료!` }

    } catch (error: any) {
        return { ok: false, message: error.message };
    }
}