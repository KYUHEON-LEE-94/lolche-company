import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMyMember } from '@/lib/members/myMember'
import {
  REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH,
  isMissingTableError,
  listRiotAccounts,
  markMemberPending,
  mirrorPrimaryToMember,
  pickPrimaryAccount,
  riotAccountsMigrationResponse,
} from '@/lib/members/primaryAccount'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_req: Request, ctx: Ctx) {
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

  // ⚠ 소유권 가드 1: 내 계정 목록 안에 있는 id만 대상이 된다.
  const target = listed.accounts.find((a) => a.id === accountId)
  if (!target) {
    return NextResponse.json({ ok: false, message: '계정을 찾을 수 없습니다.' }, { status: 404 })
  }

  if (pickPrimaryAccount(listed.accounts)?.id === accountId && target.is_primary) {
    return NextResponse.json({ ok: true, message: '이미 대표 계정입니다.' })
  }

  // ⚠ 소유권 가드 2(DB): RPC 내부에서도 member_id로 한 번 더 검증한다.
  //   부분 유니크 인덱스는 비지연이라 단일 UPDATE 스왑이 중간 상태에서 위반되므로
  //   해제→지정 2문장을 한 트랜잭션(RPC)으로 처리한다.
  const { error } = await supabaseAdmin.rpc('set_primary_riot_account', {
    p_member_id: memberId,
    p_account_id: accountId,
  })

  if (error) {
    if (isMissingTableError(error) || error.code === 'PGRST202') {
      return riotAccountsMigrationResponse()
    }
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }

  // 정책 반전 지점: true면 대표 전환도 재심사 대상이 된다(부계정 추가 → 대표 전환
  // 으로 심사를 우회하는 경로를 닫는다). 캐시 갱신과 반드시 짝으로 수행한다.
  const backToPending = REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH && me.member.status === 'approved'
  if (backToPending) {
    const pendingError = await markMemberPending(memberId)
    if (pendingError) {
      return NextResponse.json({ ok: false, message: pendingError }, { status: 500 })
    }
  }

  const mirrored = await mirrorPrimaryToMember(memberId)
  if (!mirrored.ok) {
    return NextResponse.json({ ok: false, message: mirrored.message }, { status: 500 })
  }

  revalidatePath('/tft')
  revalidatePath('/lol')
  revalidatePath('/')
  revalidatePath('/profile')

  return NextResponse.json({
    ok: true,
    backToPending,
    message: backToPending
      ? '대표 계정을 변경했습니다. 관리자 승인 후 랭킹에 다시 표시돼요.'
      : '대표 계정을 변경했습니다. 랭킹에 이 계정이 표시됩니다.',
  })
}
