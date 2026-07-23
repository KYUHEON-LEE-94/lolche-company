import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createRouteClient } from '@/lib/supabase/route'
import { supabaseService } from '@/lib/supabase/service'
import { getDiscordId } from '@/lib/auth/discord'
import { resolveSteamId } from '@/lib/steam/resolveSteamId'
import { fetchPlayerSummaries } from '@/lib/steam/api'
import { STEAM_VISIBILITY_PUBLIC, syncSteamMemberById } from '@/lib/sync/syncSteamMember'

export const dynamic = 'force-dynamic'

const SELECT_COLUMNS =
  'id, member_name, status, steam_id64, steam_persona, steam_avatar_url, steam_visibility, steam_linked_at, steam_synced_at, steam_sync_error'

type MyMember = {
  id: string
  member_name: string
  status: string | null
  steam_id64: string | null
  steam_persona: string | null
  steam_avatar_url: string | null
  steam_visibility: number | null
  steam_linked_at: string | null
  steam_synced_at: string | null
  steam_sync_error: string | null
}

type Lookup =
  | { ok: true; member: MyMember | null }
  | { ok: false; status: number; message: string }

async function getSessionUser() {
  const supabase = await createRouteClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/**
 * ⚠ 대상 행은 오직 세션 user_id 로 특정한다. body 의 member id 는 절대 신뢰하지 않는다.
 * user_id 미연결(관리자가 discord_id 만 사전 등록) 행만 discord_id 로 보조 조회한다.
 */
async function findMyMember(userId: string, discordId: string | null): Promise<Lookup> {
  const { data, error } = await supabaseService
    .schema('public')
    .from('members')
    .select(SELECT_COLUMNS)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) return { ok: false, status: 500, message: error.message }
  if (data) return { ok: true, member: data as MyMember }

  if (!discordId) return { ok: true, member: null }

  const { data: byDiscord, error: discordError } = await supabaseService
    .schema('public')
    .from('members')
    .select(`${SELECT_COLUMNS}, user_id`)
    .eq('discord_id', discordId)
    .is('user_id', null)
    .maybeSingle()

  if (discordError) return { ok: false, status: 500, message: discordError.message }
  return { ok: true, member: (byDiscord as MyMember | null) ?? null }
}

function toPayload(member: MyMember | null) {
  if (!member || !member.steam_id64) return null
  return {
    steam_id64: member.steam_id64,
    steam_persona: member.steam_persona,
    steam_avatar_url: member.steam_avatar_url,
    steam_visibility: member.steam_visibility,
    steam_linked_at: member.steam_linked_at,
    steam_synced_at: member.steam_synced_at,
    steam_sync_error: member.steam_sync_error,
    is_private: member.steam_visibility != null && member.steam_visibility !== STEAM_VISIBILITY_PUBLIC,
  }
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const lookup = await findMyMember(user.id, getDiscordId(user))
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, message: lookup.message }, { status: lookup.status })
  }

  return NextResponse.json({
    ok: true,
    hasMember: Boolean(lookup.member),
    steam: toPayload(lookup.member),
  })
}

export async function POST(req: Request) {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body = (await req.json().catch(() => null)) as { steam_input?: unknown } | null

  const lookup = await findMyMember(user.id, getDiscordId(user))
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, message: lookup.message }, { status: lookup.status })
  }
  if (!lookup.member) {
    return NextResponse.json(
      { ok: false, message: '먼저 프로필에서 멤버 등록을 완료해주세요.' },
      { status: 400 },
    )
  }
  const member = lookup.member

  const resolved = await resolveSteamId(body?.steam_input)
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, message: resolved.message }, { status: resolved.status })
  }
  const steamId64 = resolved.steamId64

  // 소유권 증명을 하지 않으므로 선점만 막는다. 유니크 인덱스와 이중 방어.
  const { data: taken, error: takenError } = await supabaseService
    .schema('public')
    .from('members')
    .select('id')
    .eq('steam_id64', steamId64)
    .neq('id', member.id)
    .maybeSingle()

  if (takenError) {
    return NextResponse.json({ ok: false, message: takenError.message }, { status: 500 })
  }
  if (taken) {
    return NextResponse.json(
      { ok: false, message: '이미 다른 멤버가 등록한 스팀 계정입니다.' },
      { status: 409 },
    )
  }

  let persona: string | null = null
  let avatar: string | null = null
  let visibility: number | null = null
  try {
    const [summary] = await fetchPlayerSummaries([steamId64])
    if (!summary) {
      return NextResponse.json(
        { ok: false, message: '스팀에서 해당 계정을 찾을 수 없습니다.' },
        { status: 400 },
      )
    }
    persona = summary.personaname || null
    avatar = summary.avatarfull || null
    visibility = summary.communityvisibilitystate
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : '스팀 조회에 실패했습니다.' },
      { status: 502 },
    )
  }

  const { error: updateError } = await supabaseService
    .schema('public')
    .from('members')
    .update({
      steam_id64: steamId64,
      steam_persona: persona,
      steam_avatar_url: avatar,
      steam_visibility: visibility,
      steam_linked_at: new Date().toISOString(),
      steam_sync_error: null,
      // user_id 미연결 행을 여기서 본인에게 묶는다 (member 라우트와 동일 원칙).
      user_id: user.id,
    })
    .eq('id', member.id)

  if (updateError) {
    // 유니크 인덱스 위반은 경합으로 뚫린 선점이므로 409 로 변환한다.
    const conflict = updateError.code === '23505'
    return NextResponse.json(
      {
        ok: false,
        message: conflict ? '이미 다른 멤버가 등록한 스팀 계정입니다.' : updateError.message,
      },
      { status: conflict ? 409 : 400 },
    )
  }

  // 등록 직후 본인 1명만 온디맨드 동기화. 실패해도 등록 자체는 유지한다.
  let syncWarning: string | null = null
  try {
    const result = await syncSteamMemberById(member.id)
    if (result && !result.ok) syncWarning = result.message
  } catch (e) {
    syncWarning = e instanceof Error ? e.message : '동기화에 실패했습니다.'
  }

  revalidatePath('/steam')
  revalidatePath('/profile')

  const isPrivate = visibility !== STEAM_VISIBILITY_PUBLIC

  return NextResponse.json({
    ok: true,
    steam: {
      steam_id64: steamId64,
      steam_persona: persona,
      steam_avatar_url: avatar,
      steam_visibility: visibility,
      is_private: isPrivate,
    },
    syncWarning,
    message: isPrivate
      ? '스팀 계정을 연결했습니다. 프로필이 비공개라 게임 데이터는 표시되지 않습니다.'
      : '스팀 계정을 연결했습니다.',
  })
}

export async function DELETE() {
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.json({ ok: false, message: '로그인이 필요합니다.' }, { status: 401 })
  }

  const lookup = await findMyMember(user.id, getDiscordId(user))
  if (!lookup.ok) {
    return NextResponse.json({ ok: false, message: lookup.message }, { status: lookup.status })
  }
  if (!lookup.member) {
    return NextResponse.json({ ok: false, message: '멤버 정보가 없습니다.' }, { status: 404 })
  }

  const { error: gamesError } = await supabaseService
    .schema('public')
    .from('steam_owned_games')
    .delete()
    .eq('member_id', lookup.member.id)

  if (gamesError) {
    return NextResponse.json({ ok: false, message: gamesError.message }, { status: 500 })
  }

  const { error } = await supabaseService
    .schema('public')
    .from('members')
    .update({
      steam_id64: null,
      steam_persona: null,
      steam_avatar_url: null,
      steam_visibility: null,
      steam_linked_at: null,
      steam_synced_at: null,
      steam_sync_error: null,
    })
    .eq('id', lookup.member.id)

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 })
  }

  revalidatePath('/steam')
  revalidatePath('/profile')

  return NextResponse.json({ ok: true, message: '스팀 연결을 해제했습니다.' })
}
