import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMyMember } from '@/lib/members/myMember'
import { isSameRiotId, parseRiotAccountInput } from '@/lib/members/memberInput'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import {
  CLEARED_RANK_COLUMNS,
  CLEARED_RANK_COLUMNS_LEGACY,
  REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH,
  REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE,
  isUniqueViolation,
  listRiotAccounts,
  markMemberPending,
  mirrorPrimaryToMember,
  pickPrimaryAccount,
  riotAccountsMigrationResponse,
} from '@/lib/members/primaryAccount'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

/** 계정을 건드린 뒤 공개 랭킹 캐시를 다시 계산한다. */
function revalidatePublic() {
  revalidatePath('/tft')
  revalidatePath('/lol')
  revalidatePath('/')
  revalidatePath('/profile')
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id: accountId } = await ctx.params

  const me = await getMyMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  if (!me.member) {
    return NextResponse.json({ ok: false, message: '멤버 정보를 찾을 수 없습니다.' }, { status: 404 })
  }
  const memberId = me.member.id

  const body = await req.json().catch(() => null)
  const parsed = parseRiotAccountInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 })
  }

  const listed = await listRiotAccounts(memberId)
  if (!listed.ok) {
    if (listed.missingTable) return riotAccountsMigrationResponse()
    return NextResponse.json({ ok: false, message: listed.message }, { status: 500 })
  }

  // ⚠ 소유권 가드: 내 계정 목록 안에서만 대상을 찾는다.
  const target = listed.accounts.find((a) => a.id === accountId)
  if (!target) {
    return NextResponse.json({ ok: false, message: '계정을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (isSameRiotId(parsed.value, target)) {
    return NextResponse.json({ ok: true, message: '변경된 내용이 없습니다.' })
  }
  if (listed.accounts.some((a) => a.id !== accountId && isSameRiotId(parsed.value, a))) {
    return NextResponse.json({ ok: false, message: '이미 등록한 라이엇 ID입니다.' }, { status: 409 })
  }

  const isPrimary = pickPrimaryAccount(listed.accounts)?.id === accountId

  // 다른 사람의 계정으로 바뀌었으므로 puuid·랭크는 전부 무효다.
  // 남겨 두면 다음 동기화 전까지 옛 계정의 티어가 랭킹에 남는다.
  const clearRiotId = (cleared: Record<string, null>) =>
    supabaseAdmin
      .from('riot_accounts')
      .update({
        riot_game_name: parsed.value.riot_game_name,
        riot_tagline: parsed.value.riot_tagline,
        riot_puuid: null,
        ...cleared,
      })
      .eq('id', accountId)
      .eq('member_id', memberId)

  let { error } = await clearRiotId(CLEARED_RANK_COLUMNS)
  // 20260729_lol_puuid.sql 미적용이면 42703. 무효화를 통째로 포기하면 옛 티어가 남으므로 나머지만 지운다.
  if (error && isMissingColumnError(error)) {
    ;({ error } = await clearRiotId(CLEARED_RANK_COLUMNS_LEGACY))
  }

  if (error) {
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { ok: false, message: '이미 등록된 라이엇 ID입니다. 관리자에게 문의해주세요.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 })
  }

  let backToPending = false
  if (isPrimary) {
    // 대표 계정의 Riot ID 문자열 변경 = 랭킹에 오르는 값의 변경 → 기존 규칙대로 재심사.
    backToPending = REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE && me.member.status === 'approved'
    if (backToPending) {
      const pendingError = await markMemberPending(memberId)
      if (pendingError) {
        return NextResponse.json({ ok: false, message: pendingError }, { status: 500 })
      }
    }
    await mirrorPrimaryToMember(memberId)
    revalidatePublic()
  } else {
    // 부계정 수정은 공개 노출값을 바꾸지 않으므로 status를 건드리지 않는다.
    revalidatePath('/profile')
  }

  return NextResponse.json({
    ok: true,
    backToPending,
    message: backToPending
      ? '대표 계정을 변경해 승인 대기 상태로 돌아갔습니다. 관리자 승인 후 랭킹에 표시돼요.'
      : '계정 정보를 수정했습니다.',
  })
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id: accountId } = await ctx.params

  const me = await getMyMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  if (!me.member) {
    return NextResponse.json({ ok: false, message: '멤버 정보를 찾을 수 없습니다.' }, { status: 404 })
  }
  const memberId = me.member.id

  const listed = await listRiotAccounts(memberId)
  if (!listed.ok) {
    if (listed.missingTable) return riotAccountsMigrationResponse()
    return NextResponse.json({ ok: false, message: listed.message }, { status: 500 })
  }

  const target = listed.accounts.find((a) => a.id === accountId)
  if (!target) {
    return NextResponse.json({ ok: false, message: '계정을 찾을 수 없습니다.' }, { status: 404 })
  }

  // 멤버는 항상 라이엇 계정을 1개 이상 보유한다. 0개가 되면 members 캐시가
  // 갱신될 근거를 잃고 랭킹에 옛 값이 영구히 남는다.
  if (listed.accounts.length <= 1) {
    return NextResponse.json(
      { ok: false, message: '마지막 라이엇 계정은 삭제할 수 없습니다. 먼저 다른 계정을 추가해주세요.' },
      { status: 409 },
    )
  }

  const wasPrimary = pickPrimaryAccount(listed.accounts)?.id === accountId

  const { error } = await supabaseAdmin
    .from('riot_accounts')
    .delete()
    .eq('id', accountId)
    .eq('member_id', memberId)

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }

  let backToPending = false
  if (wasPrimary) {
    // 자동 승격 UPDATE는 없다. 남은 계정 중 account_no 최솟값이 파생 대표가 된다.
    backToPending = REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH && me.member.status === 'approved'
    if (backToPending) await markMemberPending(memberId)
    await mirrorPrimaryToMember(memberId)
    revalidatePublic()
  } else {
    revalidatePath('/profile')
  }

  return NextResponse.json({
    ok: true,
    backToPending,
    message: wasPrimary
      ? '대표 계정을 삭제했습니다. 남은 계정 중 첫 번째가 대표가 됩니다.'
      : '계정을 삭제했습니다.',
  })
}
