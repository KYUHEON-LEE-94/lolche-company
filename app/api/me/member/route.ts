import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import { isSameRiotId, parseMemberInput } from '@/lib/members/memberInput'

export const dynamic = 'force-dynamic'

/**
 * 승인된 멤버가 Riot ID를 바꾸면 다시 심사를 받게 할지 여부.
 * true(기본)인 이유: 검증 없이 Riot ID를 갈아끼우면 타인의 상위 티어 계정으로
 * 바꿔치기해 랭킹을 조작할 수 있다.
 */
const REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE = true

const SELECT_COLUMNS =
  'id, member_name, riot_game_name, riot_tagline, status, rejected_reason, requested_at, approved_at, user_id, discord_id'

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

      revalidatePath('/')
      revalidatePath('/profile')
      return NextResponse.json({ ok: true, status: 'pending', message: '신청이 접수되었습니다.' })
    }
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

  revalidatePath('/')
  revalidatePath('/profile')

  return NextResponse.json({
    ok: true,
    status: 'pending',
    message: '신청이 접수되었습니다. 관리자 승인 후 랭킹에 표시돼요.',
  })
}
