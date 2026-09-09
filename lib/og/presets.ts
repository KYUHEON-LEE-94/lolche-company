import 'server-only'
import type { ImageResponse } from 'next/og'
import { renderOgCard } from '@/lib/og/card'
import { getLolTop3, getOgSeason, getTftTop3 } from '@/lib/og/data'
import { LOL_ENABLED } from '@/lib/constants/features'

export const SERVICE_NAME = '롤체 컴퍼니'
export const SERVICE_NAME_LATIN = 'LOLCHE COMPANY'

const KST_FORMATTER = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function updatedFooter(): { footer: string; footerLatin: string } {
  const now = new Date()
  return {
    footer: `${KST_FORMATTER.format(now)} 기준`,
    footerLatin: `Updated ${now.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
  }
}

/** TFT 솔로 TOP3 카드. 홈 · /tft · /login 폴백이 공유한다. */
export async function renderTftTop3Card(): Promise<ImageResponse> {
  try {
    const [season, rows] = await Promise.all([getOgSeason(), getTftTop3()])
    const seasonLabel = season ? `${season.season_name} · 세트 ${season.set_number}` : '롤체 랭킹'
    return await renderOgCard({
      kicker: SERVICE_NAME,
      kickerLatin: SERVICE_NAME_LATIN,
      title: `${seasonLabel} TOP 3`,
      titleLatin: 'TFT LEADERBOARD TOP 3',
      rows,
      emptyText: '아직 랭킹 데이터가 없습니다',
      emptyTextLatin: 'No ranking data yet',
      ...updatedFooter(),
    })
  } catch (e) {
    console.warn('[og] TFT 카드 렌더 실패', e instanceof Error ? e.message : '오류 발생')
    return renderBrandCard()
  }
}

/** LoL 솔로랭크 TOP3 카드. 기능 플래그가 꺼져 있으면 데이터 조회 없이 브랜드 카드. */
export async function renderLolTop3Card(): Promise<ImageResponse> {
  if (!LOL_ENABLED) return renderBrandCard()
  try {
    const rows = await getLolTop3()
    return await renderOgCard({
      kicker: SERVICE_NAME,
      kickerLatin: SERVICE_NAME_LATIN,
      title: '리그 오브 레전드 TOP 3',
      titleLatin: 'LEAGUE OF LEGENDS TOP 3',
      rows,
      emptyText: '아직 랭킹 데이터가 없습니다',
      emptyTextLatin: 'No ranking data yet',
      ...updatedFooter(),
    })
  } catch (e) {
    console.warn('[og] LoL 카드 렌더 실패', e instanceof Error ? e.message : '오류 발생')
    return renderBrandCard()
  }
}

/** 데이터 없이도 항상 렌더되는 기본 카드. */
export function renderBrandCard(): Promise<ImageResponse> {
  return renderOgCard({
    kicker: SERVICE_NAME,
    kickerLatin: SERVICE_NAME_LATIN,
    title: '단톡방 전용 TFT 랭킹 · 내전 · 스팀 라운지',
    titleLatin: 'TFT Ranking · Custom Games · Steam Lounge',
    rows: [],
    emptyText: '디스코드로 로그인하고 순위를 확인하세요',
    emptyTextLatin: 'Sign in with Discord to see the leaderboard',
  })
}
