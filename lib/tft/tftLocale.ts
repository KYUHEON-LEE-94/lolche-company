import 'server-only'
import krUnits from './krUnits.generated.json'

type KrUnitEntry = { name?: string; image?: string }
const krUnitMap: Record<string, KrUnitEntry> = krUnits

type KrMap = Record<string, string>

export type KrMaps = {
  traits: KrMap
  augments: KrMap
  champions: KrMap
  championImages: KrMap
  cdUnitNames: KrMap
  cdUnitImages: KrMap
}

function cleanName(raw: string): string {
  return raw
    .replace(/^TFT\d+_Augment_/, '')
    .replace(/^TFT\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

// 일부 챔피언은 characterId와 다른 파일명을 사용 (예: Rhaast = Kayn 변신 형태)
const IMAGE_FILENAME_OVERRIDES: Record<string, string> = {
  tft17_rhaast: 'tft17_kayn_slay_square',
}

/** character_id → Data Dragon 이미지 URL, 메타데이터 누락 시 Community Dragon fallback */
export function getUnitImageUrl(characterId: string, maps: KrMaps): string {
  const officialUrl = maps.championImages[characterId]
  if (officialUrl) return officialUrl

  const cdUrl = maps.cdUnitImages[characterId]
  if (cdUrl) return cdUrl

  const lower = characterId.toLowerCase()
  const filename = IMAGE_FILENAME_OVERRIDES[lower] ?? `${lower}_square`
  // CommunityDragon의 HUD 기물 아이콘은 `.tft_setN` 접미사가 없는 PNG로 제공된다.
  // 예: TFT17_Gnar → tft17_gnar_square.png. 이전 URL은 존재하지 않아 최신 세트 기물이
  // 전부 깨진 이미지로 표시됐다.
  return `https://raw.communitydragon.org/latest/game/assets/characters/${lower}/hud/${filename}.png`
}

let mapsCache: KrMaps | null = null

async function fetchKrMaps(): Promise<KrMaps> {
  const traits: KrMap = {}
  const augments: KrMap = {}
  const champions: KrMap = {}
  const championImages: KrMap = {}
  const cdUnitNames: KrMap = {}
  const cdUnitImages: KrMap = {}

  try {
    const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      next: { revalidate: 86400 },
    })
    const version: string = versionRes.ok
      ? ((await versionRes.json()) as string[])[0]
      : '16.10.1'

    const [traitRes, augRes, champRes] = await Promise.all([
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/tft-trait.json`, {
        next: { revalidate: 86400 },
      }),
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/tft-augments.json`, {
        next: { revalidate: 86400 },
      }),
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/tft-champion.json`, {
        next: { revalidate: 86400 },
      }),
    ])

    if (traitRes.ok) {
      const data = await traitRes.json()
      for (const [id, entry] of Object.entries<{ name?: string }>(data.data ?? {})) {
        if (entry.name) traits[id] = entry.name
      }
    }

    if (augRes.ok) {
      const data = await augRes.json()
      for (const [id, entry] of Object.entries<{ name?: string }>(data.data ?? {})) {
        if (entry.name) augments[id] = entry.name
      }
    }

    if (champRes.ok) {
      const data = await champRes.json()
      for (const entry of Object.values<{ id?: string; name?: string; image?: { full?: string } }>(data.data ?? {})) {
        if (entry.id && entry.name) champions[entry.id] = entry.name
        if (entry.id && entry.image?.full) {
          championImages[entry.id] = `https://ddragon.leagueoflegends.com/cdn/${version}/img/tft-champion/${entry.image.full}`
        }
      }
    }
  } catch (e) {
    console.error('tftLocale fetch error', e instanceof Error ? e.message : e)
  }

  // ddragon tft-champion.json에 없는 세트18 유닛(DA_Sentinel18, DA_18_Ahri 등)의
  // 한글 이름·이미지 폴백. CommunityDragon ko_kr.json(≈23.5MB)은 Next 캐시 2MB 한도를 넘어
  // 런타임 fetch가 콜드마다 재파싱돼 상세 전적을 느리게 했다 → 빌드타임 생성 정적 맵으로 대체.
  // 재생성: npm run gen:tft-locale (scripts/gen-tft-kr-units.mjs)
  for (const [key, v] of Object.entries(krUnitMap)) {
    if (v.name) cdUnitNames[key] = v.name
    if (v.image) cdUnitImages[key] = v.image
  }

  return { traits, augments, champions, championImages, cdUnitNames, cdUnitImages }
}

export async function getKrMaps(): Promise<KrMaps> {
  if (!mapsCache) {
    mapsCache = await fetchKrMaps()
  }
  return mapsCache
}

export function toKrTraitName(id: string, maps: KrMaps): string {
  return maps.traits[id] ?? cleanName(id)
}

export function toKrAugmentName(id: string, maps: KrMaps): string {
  return maps.augments[id] ?? cleanName(id)
}

export function toKrChampionName(characterId: string, maps: KrMaps): string {
  return maps.champions[characterId] ?? maps.cdUnitNames[characterId] ?? cleanName(characterId)
}
