import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getViewerMember, isApprovedMember } from '@/lib/customGames/authorize'
import { isMissingFunctionError } from '@/lib/db/pgErrors'

// ⚠ 세션 기반 응답이므로 절대 캐시하지 않는다.
export const dynamic = 'force-dynamic'

// ⚠ 이 라우트는 DB(steam_owned_games / steam_apps)만 조회한다.
//   lib/steam/* 은 STEAM_API_KEY 를 쥐고 있으므로 여기서 import 하지 않는다.

const RESULT_LIMIT = 30
const QUERY_MIN = 2

type GameOptionRow = {
  appid: number
  name: string | null
  owner_count: number
  is_multiplayer: boolean | null
}

export async function GET(req: Request) {
  const viewer = await getViewerMember()
  if (!viewer) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (!isApprovedMember(viewer)) {
    return NextResponse.json({ error: '승인된 멤버만 이용할 수 있습니다' }, { status: 403 })
  }

  const url = new URL(req.url)
  const rawQuery = (url.searchParams.get('q') ?? '').trim()
  // 1자 검색은 사실상 전량 스캔이라 서버에서 거부하고 인기순 기본 목록을 준다.
  const query = rawQuery.length >= QUERY_MIN ? rawQuery : null
  const multiplayerOnly = url.searchParams.get('multiplayer_only') !== '0'

  const { data, error } = await supabaseAdmin.rpc('steam_game_options', {
    p_query: query,
    p_multiplayer_only: multiplayerOnly,
    p_limit: RESULT_LIMIT,
  })

  if (error) {
    if (isMissingFunctionError(error)) {
      return NextResponse.json({ options: [], migration_required: true })
    }
    console.error('[steam/game-options] rpc 실패', error.message)
    return NextResponse.json({ error: '게임 목록을 불러오지 못했습니다' }, { status: 500 })
  }

  const rows = (data ?? []) as GameOptionRow[]
  const options = rows.map((row) => ({
    appid: row.appid,
    name: row.name ?? `앱 ${row.appid}`,
    owner_count: Number(row.owner_count ?? 0),
    is_multiplayer: row.is_multiplayer,
  }))

  return NextResponse.json({ options })
}
