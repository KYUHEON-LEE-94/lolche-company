type KrMap = Record<string, string>

export type KrMaps = {
  traits: KrMap
  augments: KrMap
  champions: KrMap
}

function cleanName(raw: string): string {
  return raw
    .replace(/^TFT\d+_Augment_/, '')
    .replace(/^TFT\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

/** character_id → Community Dragon HUD 스퀘어 이미지 URL (시즌 자동 감지) */
export function getUnitImageUrl(characterId: string): string {
  const lower = characterId.toLowerCase()
  const setMatch = characterId.match(/^TFT(\d+)_/i)
  const setNum = setMatch?.[1] ?? '17'
  return `https://raw.communitydragon.org/latest/game/assets/characters/${lower}/hud/${lower}_square.tft_set${setNum}.png`
}

/** rarity(0-4) → 비용 등급 Tailwind border 클래스 */
export function rarityBorderClass(rarity: number): string {
  const map: Record<number, string> = {
    0: 'border-slate-400',
    1: 'border-green-400',
    2: 'border-blue-400',
    3: 'border-purple-400',
    4: 'border-yellow-400',
  }
  return map[rarity] ?? 'border-slate-400'
}

let mapsCache: KrMaps | null = null

async function fetchKrMaps(): Promise<KrMaps> {
  const traits: KrMap = {}
  const augments: KrMap = {}
  const champions: KrMap = {}

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
      for (const entry of Object.values<{ id?: string; name?: string }>(data.data ?? {})) {
        if (entry.id && entry.name) champions[entry.id] = entry.name
      }
    }
  } catch (e) {
    console.error('tftLocale fetch error', e instanceof Error ? e.message : e)
  }

  return { traits, augments, champions }
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
  return maps.champions[characterId] ?? cleanName(characterId)
}
