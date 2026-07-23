import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveSteamViewer } from '@/lib/members/steamViewer'
import { isMissingFunctionError } from '@/lib/db/pgErrors'

// ⚠ 세션 의존 응답이다. /steam 페이지의 ISR(revalidate=300) 캐시에 절대 섞이면 안 되므로
//   이 라우트만 동적으로 분리한다.
export const dynamic = 'force-dynamic'

// ⚠ DB(steam_owned_games / steam_apps / members)만 조회한다. lib/steam/* import 금지.

type SharedRow = {
  member_id: string
  member_name: string | null
  steam_avatar_url: string | null
  profile_image_path: string | null
  shared_count: number
  preview_names: string[] | null
}

export async function GET(req: Request) {
  const viewer = await resolveSteamViewer()
  if (!viewer.ok) {
    return NextResponse.json({ ok: false, message: viewer.message }, { status: viewer.status })
  }
  if (viewer.state !== 'ok') {
    return NextResponse.json({ ok: true, state: viewer.state, members: [] })
  }

  const multiplayerOnly = new URL(req.url).searchParams.get('multiplayer_only') !== '0'

  const { data, error } = await supabaseAdmin.rpc('steam_shared_with_member', {
    p_member_id: viewer.memberId,
    p_multiplayer_only: multiplayerOnly,
  })

  if (error) {
    // RPC 미적용은 장애가 아니다. 개인화 섹션만 안내로 degrade하고 페이지는 살린다.
    if (isMissingFunctionError(error)) {
      return NextResponse.json({ ok: true, state: 'ok', members: [], migration_required: true })
    }
    console.error('[steam/shared-with-me] rpc 실패', error.message)
    return NextResponse.json(
      { ok: false, message: '목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }

  const members = ((data ?? []) as SharedRow[]).map((row) => ({
    member_id: row.member_id,
    member_name: row.member_name ?? '알 수 없음',
    steam_avatar_url: row.steam_avatar_url,
    profile_image_path: row.profile_image_path,
    shared_count: Number(row.shared_count ?? 0),
    preview_names: row.preview_names ?? [],
  }))

  return NextResponse.json({ ok: true, state: 'ok', members })
}
