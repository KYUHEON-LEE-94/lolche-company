// lib/steam/appDetails.ts
// 멀티플레이 여부 판정.
//
// ⚠ Steam Web API 에는 멀티플레이 여부 필드가 없다. store.steampowered.com/api/appdetails 는
//   비공식(문서화되지 않은) 엔드포인트이므로
//     - 앱당 딱 1회만 조회하고 steam_apps 에 영구 보관한다
//     - 호출 간격을 둔다 (레이트리밋 미문서화, 과호출 시 429/차단)
//     - 실패는 null 로 두고 전체 동기화를 깨뜨리지 않는다
import 'server-only'

/** Multi-player(1), Online Co-op(38), PvP(49) */
const MULTIPLAYER_CATEGORY_IDS = new Set([1, 38, 49])

export type AppDetailsResult = {
  /** true=멀티, false=싱글, null=판정 실패(미확인) */
  isMultiplayer: boolean | null
  categoryIds: number[] | null
}

const UNKNOWN: AppDetailsResult = { isMultiplayer: null, categoryIds: null }

export async function fetchAppMultiplayer(appid: number): Promise<AppDetailsResult> {
  try {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=categories`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return UNKNOWN

    const json = (await res.json()) as Record<
      string,
      { success?: unknown; data?: { categories?: Array<{ id?: unknown }> } } | undefined
    >
    const entry = json[String(appid)]
    if (!entry || entry.success !== true) return UNKNOWN

    // success=true 인데 categories 가 없으면 "카테고리 없음" = 싱글로 확정한다.
    const categories = entry.data?.categories ?? []
    const categoryIds = categories
      .map((c) => (typeof c.id === 'number' ? c.id : Number(c.id)))
      .filter((id) => Number.isFinite(id))

    return {
      isMultiplayer: categoryIds.some((id) => MULTIPLAYER_CATEGORY_IDS.has(id)),
      categoryIds,
    }
  } catch {
    return UNKNOWN
  }
}
