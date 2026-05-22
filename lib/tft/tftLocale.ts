type KrMap = Record<string, string>

function cleanName(raw: string): string {
  return raw
    .replace(/^TFT\d+_Augment_/, '')
    .replace(/^TFT\d+_/, '')
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
}

let mapsCache: { traits: KrMap; augments: KrMap } | null = null

async function fetchKrMaps(): Promise<{ traits: KrMap; augments: KrMap }> {
  const traits: KrMap = {}
  const augments: KrMap = {}

  try {
    const versionRes = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      next: { revalidate: 86400 },
    })
    const version: string = versionRes.ok
      ? ((await versionRes.json()) as string[])[0]
      : '16.10.1'

    const [traitRes, augRes] = await Promise.all([
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/tft-trait.json`, {
        next: { revalidate: 86400 },
      }),
      fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/ko_KR/tft-augments.json`, {
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
  } catch (e) {
    console.error('tftLocale fetch error', e instanceof Error ? e.message : e)
  }

  return { traits, augments }
}

export async function getKrMaps(): Promise<{ traits: KrMap; augments: KrMap }> {
  if (!mapsCache) {
    mapsCache = await fetchKrMaps()
  }
  return mapsCache
}

export function toKrTraitName(id: string, maps: { traits: KrMap }): string {
  return maps.traits[id] ?? cleanName(id)
}

export function toKrAugmentName(id: string, maps: { augments: KrMap }): string {
  return maps.augments[id] ?? cleanName(id)
}
