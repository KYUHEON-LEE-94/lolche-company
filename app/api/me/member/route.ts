import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import { isSameRiotId, parseMemberInput, type MemberInput } from '@/lib/members/memberInput'
import {
  REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE,
  ensurePrimaryAccount,
  mirrorPrimaryToMember,
} from '@/lib/members/primaryAccount'

export const dynamic = 'force-dynamic'

/**
 * members(사람)와 riot_accounts(계정) 양쪽을 정합화한다.
 * 이 라우트가 다루는 것은 항상 **대표 계정**이다(부계정은 /api/me/riot-accounts 담당).
 * 마이그레이션 미적용 환경에서는 ensurePrimaryAccount가 무해하게 통과한다.
 */
async function syncPrimaryAccount(
  memberId: string,
  input: MemberInput,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const ensured = await ensurePrimaryAccount(memberId, input)
  if (!ensured.ok) {
    return {
      ok: false,
      status: ensured.conflict ? 409 : 400,
      message: ensured.conflict
        ? '이미 다른 멤버가 등록한 라이엇 ID입니다. 관리자에게 문의해주세요.'
        : ensured.message,
    }
  }
  await mirrorPrimaryToMember(memberId)
  return { ok: true }
}

const SELECT_COLUMNS =
  'id, member_name, riot_game_name, riot_tagline, status, rejected_reason, requested_at, approved_at, user_id, discord_id'

type ClaimableRow = {
  id: string
  user_id: string | null
  discord_id: string | null
  status: string | null
}

type ClaimLookup =
  | { ok: true; row: ClaimableRow | null }
  | { ok: false; status: number; message: string }

/**
 * 와일드카드 없는 ilike는 대소문자 무시 동등 비교로 동작하지만, 사용자 입력에
 * `%`/`_`/`*`가 섞이면 패턴이 되어 버린다. 그래서 조회 결과를 소문자 정확 일치로
 * 한 번 더 거른다.
 */
async function findClaimableRow(gameName: string, tagline: string): Promise<ClaimLookup> {
  const { data, error } = await supabaseService
    .schema('public')
    .from('members')
    .select('id, user_id, discord_id, status, riot_game_name, riot_tagline')
    .ilike('riot_game_name', gameName)
    .ilike('riot_tagline', tagline)

  if (error) {
    return { ok: false, status: 500, message: error.message }
  }

  const matches = (data ?? []).filter(
    (row) =>
      (row.riot_game_name ?? '').toLowerCase() === gameName.toLowerCase() &&
      (row.riot_tagline ?? '').toLowerCase() === tagline.toLowerCase(),
  )
  if (matches.length === 0) return { ok: true, row: null }

  const claimable = matches.find((row) => !row.user_id)
  if (!claimable) {
    return {
      ok: false,
      status: 409,
      message: '이미 다른 계정에 연결된 라이엇 ID입니다. 관리자에게 문의해주세요.',
    }
  }

  return {
    ok: true,
    row: {
      id: claimable.id,
      user_id: claimable.user_id,
      discord_id: claimable.discord_id,
      status: claimable.status,
    },
  }
}

async function getSessionUser() {
  const supabase = await createRouteClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data: byUserId, error } = await supabaseService
    .schema('public')
    .from('members')
    .select(SELECT_COLUMNS)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 })
  }
  if (byUserId) {
    return NextResponse.json({ ok: true, member: byUserId })
  }

  // user_id 미연결(관리자가 discord_id만 사전 등록한 경우) 대비 fallback
  const discordId = getDiscordId(user)
  if (!discordId) {
    return NextResponse.json({ ok: true, member: null })
  }

  const { data: byDiscord, error: discordError } = await supabaseService
    .schema('public')
    .from('members')
    .select(SELECT_COLUMNS)
    .eq('discord_id', discordId)
    .maybeSingle()

  if (discordError) {
    return NextResponse.json({ ok: false, message: discordError.message }, { status: 500 })
  }
  // 다른 계정이 이미 연결된 행은 계정 탈취 방지를 위해 노출하지 않는다.
  if (!byDiscord || (byDiscord.user_id && byDiscord.user_id !== user.id)) {
    return NextResponse.json({ ok: true, member: null })
  }

  return NextResponse.json({ ok: true, member: byDiscord })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = parseMemberInput(body)
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, message: parsed.message }, { status: 400 })
  }
  const input = parsed.value

  // ⚠ body의 id는 절대 신뢰하지 않는다. 대상 행은 오직 세션 user_id로 특정한다.
  const { data: existing, error: findError } = await supabaseService
    .schema('public')
    .from('members')
    .select('id, riot_game_name, riot_tagline, status')
    .eq('user_id', user.id)
    .maybeSingle()

  if (findError) {
    return NextResponse.json({ ok: false, message: findError.message }, { status: 500 })
  }

  const discordId = getDiscordId(user)
  const nowIso = new Date().toISOString()

  if (existing) {
    const riotIdChanged = !isSameRiotId(input, existing)
    const backToPending =
      existing.status !== 'approved' ||
      (riotIdChanged && REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE)

    const { error: updateError } = await supabaseService
      .schema('public')
      .from('members')
      .update({
        member_name: input.member_name,
        riot_game_name: input.riot_game_name,
        riot_tagline: input.riot_tagline,
        ...(backToPending
          ? {
              status: 'pending' as const,
              requested_at: nowIso,
              approved_at: null,
              approved_by: null,
              rejected_reason: null,
            }
          : {}),
      })
      .eq('id', existing.id)
      .eq('user_id', user.id)

    if (updateError) {
      return NextResponse.json({ ok: false, message: updateError.message }, { status: 400 })
    }

    const synced = await syncPrimaryAccount(existing.id, input)
    if (!synced.ok) {
      return NextResponse.json({ ok: false, message: synced.message }, { status: synced.status })
    }

    revalidatePath('/tft')
    revalidatePath('/')
    revalidatePath('/profile')

    return NextResponse.json({
      ok: true,
      status: backToPending ? 'pending' : existing.status,
      message: backToPending
        ? '신청이 접수되었습니다. 관리자 승인 후 랭킹에 표시돼요.'
        : '정보가 수정되었습니다.',
    })
  }

  // 신규 신청 — discord_id가 이미 다른 계정에 연결돼 있으면 중복 등록을 막는다.
  if (discordId) {
    const { data: discordRow } = await supabaseService
      .schema('public')
      .from('members')
      .select('id, user_id')
      .eq('discord_id', discordId)
      .maybeSingle()

    if (discordRow && discordRow.user_id && discordRow.user_id !== user.id) {
      return NextResponse.json(
        { ok: false, message: '이미 다른 계정에 연결된 Discord 계정입니다. 관리자에게 문의해주세요.' },
        { status: 409 },
      )
    }

    if (discordRow) {
      const { error: linkError } = await supabaseService
        .schema('public')
        .from('members')
        .update({
          user_id: user.id,
          member_name: input.member_name,
          riot_game_name: input.riot_game_name,
          riot_tagline: input.riot_tagline,
          status: 'pending',
          requested_at: nowIso,
          approved_at: null,
          approved_by: null,
          rejected_reason: null,
        })
        .eq('id', discordRow.id)

      if (linkError) {
        return NextResponse.json({ ok: false, message: linkError.message }, { status: 400 })
      }

      const linkedSync = await syncPrimaryAccount(discordRow.id, input)
      if (!linkedSync.ok) {
        return NextResponse.json(
          { ok: false, message: linkedSync.message },
          { status: linkedSync.status },
        )
      }

      revalidatePath('/tft')
      revalidatePath('/')
      revalidatePath('/profile')
      return NextResponse.json({ ok: true, status: 'pending', message: '신청이 접수되었습니다.' })
    }
  }

  // Discord OAuth 전환 이전에 관리자가 만들어 둔 행(discord_id/user_id 모두 null)을
  // 같은 Riot ID로 신청한 본인에게 인계한다. 인계하지 않으면 같은 사람이 두 행으로
  // 쪼개져 기존 랭크·매치 기록이 새 행에 붙지 않는다.
  const takeover = await findClaimableRow(input.riot_game_name, input.riot_tagline)
  if (!takeover.ok) {
    return NextResponse.json({ ok: false, message: takeover.message }, { status: takeover.status })
  }

  if (takeover.row) {
    if (takeover.row.discord_id && discordId && takeover.row.discord_id !== discordId) {
      return NextResponse.json(
        { ok: false, message: '이미 다른 Discord 계정에 연결된 라이엇 ID입니다. 관리자에게 문의해주세요.' },
        { status: 409 },
      )
    }

    // 이미 승인되어 랭킹에 올라와 있던 기존 멤버는 인계 후에도 approved를 유지한다.
    // (Discord 전환 전부터 관리자가 등록해 둔 사람들이므로 재승인을 요구하면
    //  로그인할 때마다 랭킹에서 사라졌다 돌아오는 혼란이 생긴다)
    // 그 외(pending·rejected·신규)는 종전대로 관리자 승인을 거친다.
    const keepApproved = takeover.row.status === 'approved'

    const { data: claimed, error: claimError } = await supabaseService
      .schema('public')
      .from('members')
      .update({
        user_id: user.id,
        discord_id: discordId,
        member_name: input.member_name,
        riot_game_name: input.riot_game_name,
        riot_tagline: input.riot_tagline,
        ...(keepApproved
          ? {}
          : {
              status: 'pending' as const,
              requested_at: nowIso,
              approved_at: null,
              approved_by: null,
              rejected_reason: null,
            }),
      })
      .eq('id', takeover.row.id)
      // .is('user_id', null) 가드로 동시 인계 경합(TOCTOU)을 막는다.
      .is('user_id', null)
      .select('id')

    if (claimError) {
      return NextResponse.json({ ok: false, message: claimError.message }, { status: 400 })
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { ok: false, message: '이미 다른 계정에 연결된 라이엇 ID입니다. 관리자에게 문의해주세요.' },
        { status: 409 },
      )
    }

    const claimedSync = await syncPrimaryAccount(takeover.row.id, input)
    if (!claimedSync.ok) {
      return NextResponse.json(
        { ok: false, message: claimedSync.message },
        { status: claimedSync.status },
      )
    }

    revalidatePath('/tft')
    revalidatePath('/')
    revalidatePath('/profile')

    return NextResponse.json({
      ok: true,
      status: keepApproved ? 'approved' : 'pending',
      linked: true,
      message: keepApproved
        ? '기존 멤버 정보에 연결했습니다. 바로 랭킹에 반영돼요.'
        : '기존 멤버 정보에 연결했습니다. 관리자 승인 후 랭킹에 표시돼요.',
    })
  }

  const { data: created, error: insertError } = await supabaseService
    .schema('public')
    .from('members')
    .insert({
      member_name: input.member_name,
      riot_game_name: input.riot_game_name,
      riot_tagline: input.riot_tagline,
      user_id: user.id,
      discord_id: discordId,
      status: 'pending',
      requested_at: nowIso,
    })
    .select('id')
    .single()

  if (insertError || !created) {
    return NextResponse.json(
      { ok: false, message: insertError?.message ?? '신청에 실패했습니다.' },
      { status: 400 },
    )
  }

  const createdSync = await syncPrimaryAccount(created.id, input)
  if (!createdSync.ok) {
    // riot_accounts 생성이 실패하면 members만 남아 계정 없는 멤버가 된다. 보상 삭제.
    await supabaseService.schema('public').from('members').delete().eq('id', created.id)
    return NextResponse.json(
      { ok: false, message: createdSync.message },
      { status: createdSync.status },
    )
  }

  revalidatePath('/tft')
  revalidatePath('/')
  revalidatePath('/profile')

  return NextResponse.json({
    ok: true,
    status: 'pending',
    message: '신청이 접수되었습니다. 관리자 승인 후 랭킹에 표시돼요.',
  })
}
