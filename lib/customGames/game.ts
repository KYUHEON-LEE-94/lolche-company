import 'server-only'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  isCheckViolation,
  isMissingColumnError,
  isUniqueViolation,
} from '@/lib/db/pgErrors'
import type { GameKind } from './constants'

export { isCheckViolation, isMissingColumnError, isUniqueViolation }

/** 20260727 미적용 환경에서 42703으로 깨지는 신규 컬럼. LEGACY_GAME_COLUMNS로 fallback한다. */
export const GAME_COLUMNS =
  'id, title, status, game_type, game_kind, game_kind_label, steam_app_id, max_rounds, capacity, scheduled_at, host_member_id, created_at, ended_at'

/** 20260727 이전 스키마에서도 확실히 존재하는 컬럼만. */
export const LEGACY_GAME_COLUMNS =
  'id, title, status, game_type, game_kind, game_kind_label, max_rounds, capacity, scheduled_at, host_member_id, created_at, ended_at'

/** 20260725 이전 스키마(내전 모집 컬럼 자체가 없는 상태) */
export const PRE_RECRUIT_GAME_COLUMNS =
  'id, title, status, game_type, max_rounds, created_at, ended_at'

export type GameRow = {
  id: string
  title: string
  status: string
  game_type: string
  game_kind: GameKind
  game_kind_label: string | null
  steam_app_id: number | null
  max_rounds: number
  capacity: number
  scheduled_at: string | null
  host_member_id: string | null
  created_at: string
  ended_at: string | null
}

export const MIGRATION_REQUIRED_MESSAGE =
  '내전 모집 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요. (scripts/sql/20260725_custom_game_recruit.sql 미적용)'

export const STEAM_MIGRATION_REQUIRED_MESSAGE =
  '스팀 내전 게임 선택 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요. (scripts/sql/20260727_custom_game_steam.sql 미적용)'

export function migrationRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: MIGRATION_REQUIRED_MESSAGE, migration_required: true },
    { status: 503 },
  )
}

export function steamMigrationRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: STEAM_MIGRATION_REQUIRED_MESSAGE, migration_required: true },
    { status: 503 },
  )
}

/**
 * 라운드 결과 수집·팀 배정·게스트는 전부 Riot TFT 매치 조회를 전제한다.
 * UI에서 숨기는 것만으로는 API 직접 호출을 막지 못하므로 서버에서 차단한다.
 */
export function rejectNonTftGame(game: Pick<GameRow, 'game_kind'>): NextResponse | null {
  if (game.game_kind === 'tft') return null
  return NextResponse.json(
    { error: 'TFT 내전에서만 사용할 수 있는 기능입니다' },
    { status: 400 },
  )
}

export function rejectClosedGame(game: Pick<GameRow, 'status'>): NextResponse | null {
  if (game.status === 'ended' || game.status === 'cancelled') {
    return NextResponse.json({ error: '이미 종료된 내전입니다' }, { status: 400 })
  }
  return null
}

export type FetchGameResult =
  | { ok: true; game: GameRow; migrationRequired: boolean }
  | { ok: false; response: NextResponse }

/**
 * ⚠ GAME_COLUMNS에 신규 컬럼이 들어가면 마이그레이션 미적용 환경에서 상세 GET이 전부
 *   42703으로 깨진다. 목록 GET과 같은 "구 컬럼 fallback" 패턴을 여기에도 적용한다.
 */
export async function fetchGame(gameId: string): Promise<FetchGameResult> {
  const { data, error } = await supabaseAdmin
    .from('custom_games')
    .select(GAME_COLUMNS)
    .eq('id', gameId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return fetchGameLegacy(gameId)
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!data) return { ok: false, response: notFoundResponse() }

  return { ok: true, game: data as unknown as GameRow, migrationRequired: false }
}

async function fetchGameLegacy(gameId: string): Promise<FetchGameResult> {
  const { data, error } = await supabaseAdmin
    .from('custom_games')
    .select(LEGACY_GAME_COLUMNS)
    .eq('id', gameId)
    .maybeSingle()

  if (error) {
    // 20260725 자체가 미적용이면 여기서도 42703이 난다 → 안내로 degrade.
    if (isMissingColumnError(error)) return { ok: false, response: migrationRequiredResponse() }
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!data) return { ok: false, response: notFoundResponse() }

  return {
    ok: true,
    game: { ...(data as unknown as Omit<GameRow, 'steam_app_id'>), steam_app_id: null },
    migrationRequired: true,
  }
}

function notFoundResponse(): NextResponse {
  return NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 })
}
