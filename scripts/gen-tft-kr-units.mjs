// TFT 기물 한글 이름·이미지 정적 맵 생성기
//
// CommunityDragon ko_kr.json(실측 ≈23.5MB)을 런타임에 fetch하면 Next Data Cache 2MB 한도를
// 초과해 캐시가 불가능하고, 서버리스 콜드 스타트마다 재fetch·재파싱되어 상세 전적이 느려진다.
// 이 스크립트가 빌드 전 1회 실행해 { apiName → { name, image } } 컴팩트 맵을 정적 JSON으로 굳혀
// 런타임 fetch를 0으로 만든다.
//
// 실행:
//   npm run gen:tft-locale      (= node scripts/gen-tft-kr-units.mjs)
// 새 TFT 세트 출시 시 1회 실행 후 lib/tft/krUnits.generated.json 을 커밋한다.

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const CD_URL = 'https://raw.communitydragon.org/latest/cdragon/tft/ko_kr.json'
const OUT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'tft', 'krUnits.generated.json')

// tftLocale.ts의 cdIconUrl()과 1:1 동일 규칙: tileIcon(assets/..., .tex/.dds) → 완성 PNG URL.
function cdIconUrl(assetPath) {
  const p = assetPath.toLowerCase().replace(/\.(tex|dds)$/, '.png')
  return `https://raw.communitydragon.org/latest/game/${p}`
}

async function main() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)

  let cd
  try {
    const res = await fetch(CD_URL, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    cd = await res.json()
  } catch (e) {
    console.error('CD fetch 실패:', e instanceof Error ? e.message : '오류 발생')
    process.exit(1)
  } finally {
    clearTimeout(timeout)
  }

  const map = {}
  for (const set of cd.setData ?? []) {
    for (const c of set.champions ?? []) {
      const key = c.apiName ?? c.characterName
      if (!key) continue
      // first-wins: 중복 set number 엔트리에서 먼저 나온 값 보존 (tftLocale 현행과 동일)
      if (map[key]) continue
      const entry = {}
      if (c.name) entry.name = c.name
      if (c.tileIcon) entry.image = cdIconUrl(c.tileIcon)
      if (entry.name || entry.image) map[key] = entry
    }
  }

  // diff 안정화를 위해 키 정렬
  const sorted = {}
  for (const key of Object.keys(map).sort()) sorted[key] = map[key]

  await writeFile(OUT_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf8')
  console.log(`${Object.keys(sorted).length} keys written → ${OUT_PATH}`)
}

main()
