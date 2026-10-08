import 'server-only'
import { fetchPuuid, RiotApiError } from '@/lib/riot/api'

export type RiotIdVerification =
  | { status: 'ok'; puuid: string }
  | { status: 'not_found' }
  | { status: 'unverified'; reason: string }

/**
 * 등록 시점에 Riot ID 존재 여부를 확인한다. TFT 키 기준 puuid 를 돌려준다(LoL 키 금지).
 *
 * ★ Riot 장애(429·5xx·키 미설정·네트워크)로 확인이 불가하면 등록을 막지 않고 'unverified' 를 돌려준다.
 *   그 경우 puuid 는 null 로 저장되고 동기화가 나중에 해석한다(기존 동작과 동일).
 *   재시도하지 않는다 — 사용자 요청 경로라 지연이 길어지면 안 된다.
 */
export async function verifyRiotId(gameName: string, tagLine: string): Promise<RiotIdVerification> {
  try {
    const puuid = await fetchPuuid(gameName, tagLine)
    if (!puuid) return { status: 'unverified', reason: 'empty_puuid' }
    return { status: 'ok', puuid }
  } catch (e) {
    if (e instanceof RiotApiError && (e.status === 404 || e.status === 400)) {
      return { status: 'not_found' }
    }
    const reason = e instanceof RiotApiError ? `riot_${e.status}` : 'network_error'
    // 키·URL 은 로그에 남기지 않는다.
    console.warn('[riot] Riot ID 검증 불가 — 확인 없이 진행', { reason })
    return { status: 'unverified', reason }
  }
}

export const RIOT_ID_NOT_FOUND_MESSAGE = '존재하지 않는 Riot ID입니다. 게임명과 태그를 확인해주세요.'

/** 존재하지 않는 Riot ID 면 true. 확인 불가(Riot 장애)는 false — 등록을 막지 않는다. */
export async function isRiotIdNotFound(gameName: string, tagLine: string): Promise<boolean> {
  return (await verifyRiotId(gameName, tagLine)).status === 'not_found'
}
