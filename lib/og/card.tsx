import 'server-only'
import { ImageResponse } from 'next/og'
import { loadKoreanFont } from '@/lib/og/font'
import type { OgRankRow } from '@/lib/og/data'

export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

const FONT_FAMILY = 'NotoSansKR'

export type OgCardInput = {
  /** 상단 작은 라벨. 한글 폰트 실패 시 latin 텍스트로 대체된다. */
  kicker: string
  kickerLatin: string
  title: string
  titleLatin: string
  rows: OgRankRow[]
  footer?: string
  footerLatin?: string
  /** 데이터가 없을 때 본문에 표시할 한 줄 */
  emptyText: string
  emptyTextLatin: string
}

const MEDAL_COLORS = ['#fbbf24', '#cbd5e1', '#d8894f']

/**
 * OG 카드 공통 렌더러.
 *
 * satori 제약: Tailwind/`lib/ui/styles.ts` 사용 불가(인라인 style 만),
 * 자식이 2개 이상인 요소는 display:flex 명시, 로컬 이미지 불가.
 */
export async function renderOgCard(input: OgCardInput): Promise<ImageResponse> {
  const font = await loadKoreanFont()
  // 폰트 로드 실패 시 기본(라틴) 폰트로 렌더된다 — 한글은 tofu 가 되므로 영문 텍스트로 바꾼다.
  const latinOnly = font === null

  const kicker = latinOnly ? input.kickerLatin : input.kicker
  const title = latinOnly ? input.titleLatin : input.title
  const footer = latinOnly ? input.footerLatin : input.footer
  const emptyText = latinOnly ? input.emptyTextLatin : input.emptyText

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '52px 72px',
          background: 'linear-gradient(135deg, #0f0b24 0%, #1e1b4b 45%, #312e81 100%)',
          color: '#ffffff',
          fontFamily: latinOnly ? 'sans-serif' : FONT_FAMILY,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <div
              style={{
                display: 'flex',
                width: 14,
                height: 44,
                borderRadius: 7,
                background: 'linear-gradient(180deg,#818cf8,#4f46e5)',
                marginRight: 20,
              }}
            />
            <div style={{ fontSize: 34, letterSpacing: -0.5, color: '#c7d2fe' }}>{kicker}</div>
          </div>
          <div style={{ fontSize: 54, marginTop: 18, letterSpacing: -1.5, lineHeight: 1.15 }}>{title}</div>
        </div>

        {input.rows.length === 0 ? (
          <div style={{ fontSize: 36, color: '#a5b4fc' }}>{emptyText}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {input.rows.map((row) => (
              <div
                key={row.rank}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '14px 26px',
                  borderRadius: 20,
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.14)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: MEDAL_COLORS[row.rank - 1] ?? '#64748b',
                    color: '#1e1b4b',
                    fontSize: 28,
                    marginRight: 26,
                  }}
                >
                  {row.rank}
                </div>
                <div
                  style={{
                    display: 'flex',
                    fontSize: 38,
                    flexGrow: 1,
                    letterSpacing: -0.8,
                    // 긴 닉네임이 티어 배지를 밀어내지 않도록 자른다.
                    maxWidth: 640,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {row.name}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  <div style={{ fontSize: 30, color: '#e0e7ff' }}>{row.tier}</div>
                  <div style={{ fontSize: 22, color: '#a5b4fc', marginTop: 4 }}>{row.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {footer ? <div style={{ fontSize: 24, color: '#8b93c9' }}>{footer}</div> : <div style={{ display: 'flex' }} />}
      </div>
    ),
    {
      ...OG_SIZE,
      ...(font
        ? { fonts: [{ name: FONT_FAMILY, data: font, weight: 700 as const, style: 'normal' as const }] }
        : {}),
    },
  )
}
