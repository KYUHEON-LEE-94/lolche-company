import { NextResponse } from 'next/server'
import { getViewerMember, isApprovedMember } from '@/lib/customGames/authorize'
import { searchStoreCatalog, CATALOG_QUERY_MIN } from '@/lib/steam/storeSearch'

// ⚠ 세션 게이트가 있으므로 절대 캐시하지 않는다. 결과 캐시는 lib/steam/storeSearch.ts 가 서버 메모리에서 담당.
export const dynamic = 'force-dynamic'

// ⚠ 이 경로(app/api/steam-catalog/**)는 **외부 호출 경계**다.
//    DB 전용 경계인 app/api/steam/** 와 의도적으로 분리되어 있다 (CLAUDE.md 참조).

export async function GET(req: Request) {
  const viewer = await getViewerMember()
  if (!viewer) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 })
  if (!isApprovedMember(viewer)) {
    return NextResponse.json({ error: '승인된 멤버만 이용할 수 있습니다' }, { status: 403 })
  }

  const term = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (term.length < CATALOG_QUERY_MIN) {
    return NextResponse.json({ items: [] }, { headers: { 'Cache-Control': 'no-store' } })
  }

  const items = await searchStoreCatalog(term)
  if (items === null) {
    // 상류 장애는 500 이 아니라 200 + unavailable 로 degrade 한다. UI 가 수동 입력으로 유도한다.
    console.warn('[steam-catalog] 스토어 검색 실패 — 수동 입력 폴백')
    return NextResponse.json(
      { items: [], unavailable: true },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return NextResponse.json({ items }, { headers: { 'Cache-Control': 'no-store' } })
}
