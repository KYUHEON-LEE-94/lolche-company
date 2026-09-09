import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

/** undefined = 미시도, null = 로드 실패(영문 폴백 카드로 degrade) */
let cached: ArrayBuffer | null | undefined

const FONT_RELATIVE_PATH = 'lib/og/fonts/NotoSansKR-Bold.subset.ttf'

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  // Buffer 의 backing ArrayBuffer 는 풀링되어 앞뒤에 남의 바이트가 섞일 수 있다.
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

/**
 * OG 카드용 한글 폰트(Noto Sans KR Bold 서브셋, SIL OFL 1.1).
 *
 * satori 는 woff2 를 못 읽어 ttf 만 가능하다. 런타임 외부 fetch 는 콜드스타트 실패 지점을
 * 늘리므로 금지 — 저장소에 커밋한 로컬 자산만 읽는다.
 * 1차로 `import.meta.url`(Next 가 번들 트레이싱하는 공식 패턴), 실패 시 cwd 상대경로로 내려간다.
 */
export async function loadKoreanFont(): Promise<ArrayBuffer | null> {
  if (cached !== undefined) return cached
  try {
    const url = new URL('./fonts/NotoSansKR-Bold.subset.ttf', import.meta.url)
    cached = toArrayBuffer(await readFile(url))
    return cached
  } catch (e) {
    console.warn('[og] 폰트 트레이싱 경로 로드 실패, cwd 폴백 시도', e instanceof Error ? e.message : '오류 발생')
  }
  try {
    cached = toArrayBuffer(await readFile(path.join(process.cwd(), FONT_RELATIVE_PATH)))
  } catch (e) {
    console.warn('[og] 한글 폰트 로드 실패', e instanceof Error ? e.message : '오류 발생')
    cached = null
  }
  return cached
}
