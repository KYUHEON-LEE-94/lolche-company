import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveSteamViewer } from '@/lib/members/steamViewer'
import { isMissingFunctionError } from '@/lib/db/pgErrors'

export const dynamic = 'force-dynamic'

// ⚠ path param 은 "상대방" id 뿐이다. 내 member_id 는 항상 세션에서 유도한다.
//   그래서 남의 조합(A↔B)을 제3자가 조회할 수 없다.

const DETAIL_LIMIT = 200
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type DetailRow = {
  appid: number
  name: string | null
  is_multiplayer: boolean | null
  my_playtime_forever: number
  their_playtime_forever: number
}

type Ctx = { params: Promise<{ memberId: string }> }

export async function GET(req: Request, ctx: Ctx) {
  const { memberId } = await ctx.params
  if (!UUID_RE.test(memberId)) {
    return NextResponse.json({ ok: false, message: '잘못된 요청입니다.' }, { status: 400 })
  }

  const viewer = await resolveSteamViewer()
  if (!viewer.ok) {
    return NextResponse.json({ ok: false, message: viewer.message }, { status: viewer.status })
  }
  if (viewer.state !== 'ok') {
    return NextResponse.json({ ok: true, state: viewer.state, games: [] })
  }
  if (viewer.memberId === memberId) {
    return NextResponse.json({ ok: true, state: 'ok', games: [] })
  }

  const multiplayerOnly = new URL(req.url).searchParams.get('multiplayer_only') !== '0'

  const { data, error } = await supabaseAdmin.rpc('steam_shared_games_detail', {
    p_member_id: viewer.memberId,
    p_other_member_id: memberId,
    p_multiplayer_only: multiplayerOnly,
    p_limit: DETAIL_LIMIT,
  })

  if (error) {
    if (isMissingFunctionError(error)) {
      return NextResponse.json({ ok: true, state: 'ok', games: [], migration_required: true })
    }
    console.error('[steam/shared-with-me/detail] rpc 실패', error.message)
    return NextResponse.json(
      { ok: false, message: '목록을 불러오지 못했습니다.' },
      { status: 500 },
    )
  }

  const games = ((data ?? []) as DetailRow[]).map((row) => ({
    appid: row.appid,
    name: row.name ?? `앱 ${row.appid}`,
    is_multiplayer: row.is_multiplayer,
    my_playtime_forever: Number(row.my_playtime_forever ?? 0),
    their_playtime_forever: Number(row.their_playtime_forever ?? 0),
  }))

  return NextResponse.json({ ok: true, state: 'ok', games })
}
