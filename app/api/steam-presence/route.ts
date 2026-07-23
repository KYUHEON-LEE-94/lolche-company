import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getMyMember } from '@/lib/members/myMember'
import { fetchPresenceMap, isPresenceVisible } from '@/lib/steam/presence'

// ⚠ **외부 호출 경계.** `app/api/steam/**` 는 DB 전용이라 lib/steam/* import 가 금지돼 있다.
//   이 라우트는 Steam Web API 를 호출하므로 `app/api/steam-catalog/**` 와 같은 이유로
//   경로를 분리했다. 규칙: "이 파일이 외부를 부르는가"를 경로만으로 판별할 수 있어야 한다.
//
// ⚠ 세션 의존 응답이다. /steam 페이지의 ISR(revalidate=300) 캐시와 절대 섞이면 안 된다.
export const dynamic = 'force-dynamic'

type MemberRow = {
  id: string
  member_name: string
  steam_id64: string
  steam_visibility: number | null
  steam_avatar_url: string | null
  profile_image_path: string | null
}

type PresenceState = 'online' | 'offline' | 'unavailable'

export async function GET() {
  // 인증 없이 열면 남의 온라인 상태를 캐는 공개 프록시가 된다.
  const me = await getMyMember()
  if (!me.ok) return NextResponse.json({ ok: false, message: me.message }, { status: me.status })
  if (!me.member) {
    return NextResponse.json({ ok: false, message: '멤버 등록 후 이용할 수 있습니다.' }, { status: 403 })
  }
  if (me.member.status !== 'approved') {
    return NextResponse.json({ ok: false, message: '승인된 멤버만 이용할 수 있습니다.' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
    .from('members')
    .select('id, member_name, steam_id64, steam_visibility, steam_avatar_url, profile_image_path')
    .eq('status', 'approved')
    .not('steam_id64', 'is', null)
    .order('member_name', { ascending: true })

  if (error) {
    console.error('[steam-presence] members 조회 실패', error.message)
    return NextResponse.json({ ok: false, message: '목록을 불러오지 못했습니다.' }, { status: 500 })
  }

  const members = (data ?? []) as MemberRow[]
  if (members.length === 0) return NextResponse.json({ ok: true, members: [] })

  let presence: Awaited<ReturnType<typeof fetchPresenceMap>>
  try {
    presence = await fetchPresenceMap(members.map((m) => m.steam_id64))
  } catch (e) {
    // 로그에 URL 을 싣지 않는다 (lib/steam 관례 — 키가 쿼리로 나간다).
    console.error('[steam-presence] Steam 조회 실패', e instanceof Error ? e.message : '오류 발생')
    return NextResponse.json(
      { ok: false, message: '스팀 상태를 불러오지 못했습니다.' },
      { status: 503 },
    )
  }

  const result = members.map((m) => {
    const info = presence.get(m.steam_id64)
    const visible = isPresenceVisible(info, m.steam_visibility)
    const state: PresenceState = !visible
      ? 'unavailable'
      : (info?.personastate ?? 0) > 0
        ? 'online'
        : 'offline'

    return {
      member_id: m.id,
      member_name: m.member_name,
      steam_avatar_url: m.steam_avatar_url,
      profile_image_path: m.profile_image_path,
      state,
      persona_state: visible ? (info?.personastate ?? 0) : null,
      game_name: visible ? (info?.gameName ?? null) : null,
    }
  })

  return NextResponse.json({ ok: true, members: result })
}
