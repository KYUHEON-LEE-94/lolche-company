/**
 * PWA 아이콘 생성 스크립트 (일회성).
 *
 *   실행:  node scripts/gen-pwa-icons.mjs      (= npm run gen:pwa-icons)
 *
 * `public/images/logo2.png`(1536x1024, 비정사각)에서 **엠블럼 영역만 정사각으로 크롭**해
 * 아이콘을 만든다. 전체를 contain 하면 워드마크까지 들어가 192px 에서 로고가 알아볼 수 없이 작아진다.
 * 결과 PNG 는 커밋하므로 빌드·배포에는 이 스크립트도 sharp 도 필요 없다
 * (sharp 는 next 의 전이 의존이라 node_modules 에 이미 존재한다 — dependency 추가 0).
 *
 * 로고 원본(public/images/logo.png, logo2.png)은 절대 덮어쓰지 않는다.
 */
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = path.resolve(import.meta.dirname, '..')
const SOURCE = path.join(ROOT, 'public', 'images', 'logo2.png')
const OUT_DIR = path.join(ROOT, 'public', 'icons')

/** --color-canvas (다크 테마 배경). manifest 의 background_color 와 맞춘다. */
const BACKGROUND = { r: 0x07, g: 0x09, b: 0x0f, alpha: 1 }

/** logo2.png 안에서 원형 엠블럼이 차지하는 정사각 영역(실측). */
const EMBLEM = { left: 180, top: 265, width: 450, height: 450 }

/** maskable 은 원형 크롭을 견뎌야 하므로 로고를 안전영역(약 80%)에 가둔다. */
const TARGETS = [
  { file: 'icon-192.png', size: 192, inset: 1 },
  { file: 'icon-512.png', size: 512, inset: 1 },
  { file: 'icon-maskable-512.png', size: 512, inset: 0.8 },
  { file: 'badge-72.png', size: 72, inset: 0.85 },
]

async function main() {
  await mkdir(OUT_DIR, { recursive: true })

  for (const { file, size, inset } of TARGETS) {
    const inner = Math.round(size * inset)
    const logo = await sharp(SOURCE)
      .extract(EMBLEM)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()

    const offset = Math.round((size - inner) / 2)
    await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
      .composite([{ input: logo, top: offset, left: offset }])
      .png()
      .toFile(path.join(OUT_DIR, file))

    console.log(`generated public/icons/${file} (${size}x${size})`)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : '아이콘 생성에 실패했습니다.')
  process.exit(1)
})
