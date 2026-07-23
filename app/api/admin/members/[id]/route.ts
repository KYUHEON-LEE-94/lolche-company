import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/lib/isAdmin'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

export const dynamic = 'force-dynamic'

/**
 * members를 참조하는 자식 테이블. FK의 ON DELETE 설정이 무엇이든(NO ACTION 포함)
 * 추방이 동작하도록 애플리케이션에서 명시적으로 먼저 정리한다.
 * 순서: 리프 → 루트.
 */
const CHILD_TABLES = [
  'custom_game_results',
  'custom_game_teams',
  'custom_game_participants',
  'member_rank_history',
  'tft_match_participants',
  'steam_owned_games',
  'sync_logs',
] as const

// 테이블 자체가 없는 환경(42P01)이나 컬럼 부재(42703)는 정리할 대상이 없다는 뜻이므로 무시한다.
const IGNORABLE_PG_CODES = new Set(['42P01', '42703'])

async function purgeChildRows(
  supabase: SupabaseClient<Database>,
  memberId: string,
): Promise<string | null> {
  for (const table of CHILD_TABLES) {
    const { error } = await supabase.schema('public').from(table).delete().eq('member_id', memberId)
    if (error && !IGNORABLE_PG_CODES.has(error.code ?? '')) {
      return `${table} 정리 실패: ${error.message}`
    }
  }
  return null
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: memberId } = await params

  const { ok, supabase } = await requireAdmin()
  if (!ok) {
    return NextResponse.json({ ok: false, message: '관리자만 가능합니다.' }, { status: 403 })
  }

  const { data: member, error: memberError } = await supabase
    .schema('public')
    .from('members')
    .select('id, member_name, profile_image_path')
    .eq('id', memberId)
    .maybeSingle()

  if (memberError) {
    return NextResponse.json({ ok: false, message: memberError.message }, { status: 500 })
  }
  if (!member) {
    return NextResponse.json({ ok: false, message: '해당 멤버를 찾을 수 없습니다.' }, { status: 404 })
  }

  // 오조작 방지: 멤버명을 정확히 타이핑해야만 삭제된다.
  const body = await req.json().catch(() => null)
  const confirmName = String((body as { confirmName?: unknown } | null)?.confirmName ?? '').trim()

  if (confirmName !== member.member_name) {
    return NextResponse.json(
      { ok: false, message: '멤버명이 일치하지 않습니다. 정확히 입력해주세요.' },
      { status: 400 },
    )
  }

  // 명예의 전당은 삭제하지 않고 이름 스냅샷을 남긴 뒤 링크만 끊는다.
  const { error: hofError } = await supabase
    .schema('public')
    .from('hall_of_fame')
    .update({
      member_id: null,
      member_name_snapshot: member.member_name,
      profile_image_snapshot: member.profile_image_path,
    })
    .eq('member_id', memberId)

  // ⚠ 여기서는 42703(컬럼 부재)도 무시하지 않는다.
  //   hall_of_fame_member_id_fkey가 ON DELETE CASCADE이므로, 스냅샷 저장에 실패한 채
  //   삭제를 진행하면 과거 시즌 기록이 조용히 함께 사라진다.
  //   컬럼이 없다는 것은 마이그레이션 STEP 3이 아직 실행되지 않았다는 뜻이므로 중단한다.
  if (hofError) {
    const hint =
      hofError.code === '42703'
        ? ' (scripts/sql/20260723_member_self_registration.sql의 STEP 3을 먼저 실행하세요)'
        : ''
    return NextResponse.json(
      { ok: false, message: `명예의 전당 기록 보존 실패: ${hofError.message}${hint}` },
      { status: 500 },
    )
  }

  const purgeError = await purgeChildRows(supabase, memberId)
  if (purgeError) {
    return NextResponse.json({ ok: false, message: purgeError }, { status: 500 })
  }

  const { error: memberDeleteError } = await supabase
    .schema('public')
    .from('members')
    .delete()
    .eq('id', memberId)

  if (memberDeleteError) {
    return NextResponse.json({ ok: false, message: memberDeleteError.message }, { status: 500 })
  }

  revalidatePath('/tft')
  revalidatePath('/')
  revalidatePath('/hall-of-fame')
  revalidatePath('/custom-games')
  revalidatePath('/admin/members/control')

  return NextResponse.json({ ok: true, memberId, message: `"${member.member_name}" 멤버를 삭제했습니다.` })
}
