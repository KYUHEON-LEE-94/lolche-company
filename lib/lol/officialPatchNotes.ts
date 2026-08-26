import 'server-only'

const OFFICIAL_ORIGIN = 'https://www.leagueoflegends.com'
const PATCH_TAG_URL = `${OFFICIAL_ORIGIN}/ko-kr/news/tags/patch-notes/`
const REQUEST_TIMEOUT_MS = 12_000

// ⚠ Riot 공식 페이지는 데이터센터 IP + 봇 UA 요청을 차단(403/챌린지)하는 경향이 있다.
//   실제 브라우저처럼 보이는 헤더로 통과율을 높인다. 실패는 상위에서 degrade 한다.
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Referer: `${OFFICIAL_ORIGIN}/ko-kr/`,
}

export type OfficialLolPatchNote = {
  sourceKey: string
  title: string
  summary: string
  sourceUrl: string
  publishedAt: string
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function cleanSummary(value: unknown): string {
  const text = asString(value) ?? ''
  return text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
}

function hasPatchNotesTag(value: unknown): boolean {
  if (!Array.isArray(value)) return false
  return value.some((tag) => {
    if (typeof tag === 'string') return tag.toLowerCase() === 'patch-notes'
    if (!isRecord(tag)) return false
    return ['slug', 'name', 'id', 'machineName'].some((key) => {
      const name = asString(tag[key])?.toLowerCase()
      return name === 'patch-notes' || name === 'patch_notes'
    })
  })
}

function normalizeSourceUrl(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) return null
  try {
    const url = new URL(raw, OFFICIAL_ORIGIN)
    if (url.protocol !== 'https:' || url.origin !== OFFICIAL_ORIGIN || !url.pathname.startsWith('/ko-kr/news/game-updates/')) return null
    url.hash = ''
    url.search = ''
    return url.toString()
  } catch {
    return null
  }
}

function readUrl(card: UnknownRecord): string | null {
  const action = card.action
  if (!isRecord(action)) return null
  const payload = action.payload
  return isRecord(payload) ? normalizeSourceUrl(payload.url) : null
}

function findArticleCardGrids(value: unknown, found: unknown[][] = []): unknown[][] {
  if (Array.isArray(value)) {
    value.forEach((entry) => findArticleCardGrids(entry, found))
    return found
  }
  if (!isRecord(value)) return found
  const grid = value.articleCardGrid
  if (Array.isArray(grid)) found.push(grid)
  if (value.type === 'articleCardGrid' && Array.isArray(value.items)) found.push(value.items)
  Object.values(value).forEach((entry) => findArticleCardGrids(entry, found))
  return found
}

function extractNextData(html: string): unknown {
  const matched = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
  if (!matched?.[1]) throw new Error('공식 패치 노트 데이터를 찾지 못했습니다.')
  try {
    return JSON.parse(matched[1]) as unknown
  } catch {
    throw new Error('공식 패치 노트 데이터 형식이 올바르지 않습니다.')
  }
}

export async function fetchOfficialLolPatchNotes(): Promise<OfficialLolPatchNote[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(PATCH_TAG_URL, {
      cache: 'no-store',
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    })
    if (!response.ok) throw new Error(`공식 패치 노트 요청 실패 (${response.status})`)
    const grids = findArticleCardGrids(extractNextData(await response.text()))
    const notes = new Map<string, OfficialLolPatchNote>()
    for (const grid of grids) {
      for (const item of grid) {
        if (!isRecord(item) || !hasPatchNotesTag(item.tags)) continue
        const title = asString(item.title)
        const sourceUrl = readUrl(item)
        const publishedAt = asString(item.publishedAt)
        const timestamp = publishedAt ? new Date(publishedAt) : null
        if (!title || !sourceUrl || !timestamp || Number.isNaN(timestamp.getTime())) continue
        const description = isRecord(item.description) ? item.description.body : item.description
        notes.set(sourceUrl, {
          sourceKey: sourceUrl,
          title: title.slice(0, 160),
          summary: cleanSummary(description),
          sourceUrl,
          publishedAt: timestamp.toISOString(),
        })
      }
    }
    return [...notes.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 3)
  } finally {
    clearTimeout(timer)
  }
}
