'use server'

import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import { Database } from '@/types/supabase'
import { SupabaseClient } from '@supabase/supabase-js'
import { isMissingFunctionError } from '@/lib/db/pgErrors'

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
                // 멤버가 추방돼도 기록이 남도록 아카이브 시점의 이름/이미지를 함께 박제한다.
                member_name_snapshot: m.member_name,
                profile_image_snapshot: m.profile_image_path,
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

    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '오류가 발생했습니다.' };
    }
}

export async function updateSeasonStatusAction(id: number, targetStatus: boolean) {
    const { ok } = await requireAdmin()
    if (!ok) return { ok: false, message: '관리자 권한이 필요합니다.' }

    try {
        const { supabaseService } = await import('@/lib/supabase/service');
        const nowIso = new Date().toISOString();

        // 1. 활성화(시작)하려는 경우, 현재 활성 시즌은 "종료"로 마감한다.
        //    end_date 를 찍어야 지난 시즌으로 판별되어 "시즌 시작" 버튼이 사라진다.
        //    (기존에는 is_active 만 false 로 바꿔 end_date 가 비어 계속 시작 버튼이 노출됐다)
        if (targetStatus) {
            await supabaseService
                .schema("public")
                .from('seasons')
                .update({ is_active: false, end_date: nowIso })
                .eq('is_active', true);
        }

        // 2. 해당 시즌 상태 업데이트
        //    시작: 활성화하며 end_date 를 비운다(재시작 시 다시 진행 중 상태로).
        //    종료: 비활성화하며 end_date 를 찍어 지난 시즌으로 마감한다.
        const patch = targetStatus
            ? { is_active: true, end_date: null }
            : { is_active: false, end_date: nowIso };

        const { error } = await supabaseService
            .schema("public")
            .from('seasons')
            .update(patch)
            .eq('id', id);

        if (error) throw error;

        return { ok: true };
    } catch (error) {
        console.error('시즌 상태 변경 에러:', error);
        return { ok: false, message: error instanceof Error ? error.message : '오류가 발생했습니다.' };
    }
}

export async function deleteSeasonHallOfFameAction(seasonId: number) {
    const { ok } = await requireAdmin()
    if (!ok) return { ok: false, message: '관리자 권한이 필요합니다.' }

    try {
        const { supabaseService } = await import('@/lib/supabase/service');

        // 해당 시즌 ID를 가진 명예의 전당 기록만 삭제
        const { error } = await supabaseService
            .from('hall_of_fame')
            .delete()
            .eq('season_id', seasonId);

        if (error) throw error;

        return { ok: true };
    } catch (error) {
        console.error('시즌 기록 삭제 에러:', error);
        return { ok: false, message: error instanceof Error ? error.message : '오류가 발생했습니다.' };
    }
}

export type SeasonRolloverResult = {
    status: 'completed' | 'already_completed'
    previous_season_id: number
    next_season_id: number
    next_season_name: string
    solo_count: number
    doubleup_count: number
    awarded_count?: number
}

export async function rolloverSeasonAction(input: {
    currentSeasonId: number
    confirmation: string
    nextSeasonName: string
    nextSetNumber: number
    startAt: string
    finalSyncConfirmed: boolean
}): Promise<{ ok: true; result: SeasonRolloverResult } | { ok: false; message: string }> {
    const { ok } = await requireAdmin()
    if (!ok) return { ok: false, message: '관리자 권한이 필요합니다.' }

    if (!input || typeof input !== 'object') {
        return { ok: false, message: '시즌 전환 요청 형식이 올바르지 않습니다.' }
    }

    const currentSeasonId = Number(input.currentSeasonId)
    const nextSetNumber = Number(input.nextSetNumber)
    const nextSeasonName = typeof input.nextSeasonName === 'string' ? input.nextSeasonName.trim() : ''
    const confirmation = typeof input.confirmation === 'string' ? input.confirmation.trim() : ''
    const startAt = new Date(typeof input.startAt === 'string' ? input.startAt : '')

    if (!Number.isInteger(currentSeasonId) || currentSeasonId <= 0) {
        return { ok: false, message: '현재 시즌 정보가 올바르지 않습니다.' }
    }
    if (!input.finalSyncConfirmed) {
        return { ok: false, message: '최종 랭크 동기화 확인이 필요합니다.' }
    }
    if (!confirmation || confirmation.length > 60) {
        return { ok: false, message: '현재 시즌 이름을 정확히 입력하세요.' }
    }
    if (!nextSeasonName || nextSeasonName.length > 60) {
        return { ok: false, message: '다음 시즌 이름은 1~60자로 입력하세요.' }
    }
    if (!Number.isInteger(nextSetNumber) || nextSetNumber < 1 || nextSetNumber > 999) {
        return { ok: false, message: '다음 세트 번호는 1~999의 정수여야 합니다.' }
    }
    if (Number.isNaN(startAt.getTime())) {
        return { ok: false, message: '다음 시즌 시작 시각이 올바르지 않습니다.' }
    }

    try {
        const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
        const { data, error } = await supabaseAdmin.rpc('rollover_tft_season', {
            p_current_season_id: currentSeasonId,
            p_confirmation: confirmation,
            p_next_season_name: nextSeasonName,
            p_next_set_number: nextSetNumber,
            p_start_at: startAt.toISOString(),
        })

        if (error) {
            if (isMissingFunctionError(error)) {
                return {
                    ok: false,
                    message: '시즌 전환 기능이 아직 활성화되지 않았습니다. scripts/sql/20260805_season_rollover.sql을 먼저 적용하세요.',
                }
            }
            throw new Error(error.message)
        }
        if (!data) throw new Error('시즌 전환 결과를 받지 못했습니다.')

        // ★ 세트 전환 = 랭크 사다리 초기화. 동기화 가드(빈 응답 시 기존값 보존) 때문에
        //   동기화로는 랭크가 지워지지 않으므로, 아카이브가 끝난 지금 명시적으로 TFT 랭크를 비운다.
        //   멤버 캐시와 계정 원본을 함께 비운다 — 계정만 남으면 다음 동기화가 mirrorPrimaryToMember 로
        //   옛 값을 members 에 되살린다. LoL 은 별도 시즌이라 건드리지 않는다.
        await clearTftRanksForNewSeason()

        revalidatePath('/')
        revalidatePath('/tft')
        revalidatePath('/hall-of-fame')
        revalidatePath('/admin/seasons')

        return { ok: true, result: data as SeasonRolloverResult }
    } catch (error) {
        console.error('시즌 원클릭 전환 오류:', error)
        return {
            ok: false,
            message: error instanceof Error ? error.message : '시즌 전환 중 오류가 발생했습니다.',
        }
    }
}

/**
 * 세트 전환 직후 전 멤버의 TFT 랭크 캐시를 비운다(신규 세트는 전원 unrank 로 시작).
 * members(대표 캐시) + riot_accounts(계정 원본) 둘 다 비워야 다음 동기화가 옛 값을 되살리지 않는다.
 * LoL 컬럼은 손대지 않는다(별도 시즌). 실패해도 전환 자체는 이미 성공했으므로 로그만 남긴다.
 */
async function clearTftRanksForNewSeason() {
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
    const clearedMemberTft = {
        tft_tier: null, tft_rank: null, tft_league_points: null, tft_wins: null, tft_losses: null,
        tft_doubleup_tier: null, tft_doubleup_rank: null, tft_doubleup_league_points: null, tft_doubleup_wins: null, tft_doubleup_losses: null,
        tft_tier_prev: null, tft_rank_prev: null, tft_lp_prev: null,
    }
    const clearedAccountTft = {
        tft_tier: null, tft_rank: null, tft_league_points: null, tft_wins: null, tft_losses: null,
        tft_doubleup_tier: null, tft_doubleup_rank: null, tft_doubleup_league_points: null, tft_doubleup_wins: null, tft_doubleup_losses: null,
    }
    const [members, accounts] = await Promise.all([
        supabaseAdmin.from('members').update(clearedMemberTft).not('id', 'is', null),
        supabaseAdmin.from('riot_accounts').update(clearedAccountTft).gte('account_no', 1),
    ])
    if (members.error) console.error('시즌 전환 후 members TFT 랭크 초기화 실패:', members.error.message)
    // riot_accounts 미적용(레거시 단일 계정) 환경은 이 테이블이 없어도 정상 — 조용히 무시한다.
    if (accounts.error) console.warn('시즌 전환 후 riot_accounts 랭크 초기화 skip:', accounts.error.message)
}

/**
 * 활성 시즌의 예약 종료일(scheduled_end_at)을 설정/해제한다.
 * 값이 바뀌면 알림을 다시 무장하도록 end_reminder_sent_at 을 초기화한다.
 * scheduledEndAtIso 가 null 이면 예약을 해제한다.
 */
export async function setSeasonScheduledEndAction(id: number, scheduledEndAtIso: string | null) {
    const { ok } = await requireAdmin()
    if (!ok) return { ok: false, message: '관리자 권한이 필요합니다.' }
    try {
        const { supabaseService } = await import('@/lib/supabase/service')
        const { error } = await supabaseService
            .schema('public')
            .from('seasons')
            .update({ scheduled_end_at: scheduledEndAtIso, end_reminder_sent_at: null })
            .eq('id', id)
        if (error) throw error
        revalidatePath('/admin/seasons')
        return { ok: true }
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : '오류가 발생했습니다.' }
    }
}
