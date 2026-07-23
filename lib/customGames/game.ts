import 'server-only'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { GameKind } from './constants'

export const GAME_COLUMNS =
  'id, title, status, game_type, game_kind, game_kind_label, max_rounds, capacity, scheduled_at, host_member_id, created_at, ended_at'

export type GameRow = {
  id: string
  title: string
  status: string
  game_type: string
  game_kind: GameKind
  game_kind_label: string | null
  max_rounds: number
  capacity: number
  scheduled_at: string | null
  host_member_id: string | null
  created_at: string
  ended_at: string | null
}

export const MIGRATION_REQUIRED_MESSAGE =
  '내전 모집 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요. (scripts/sql/20260725_custom_game_recruit.sql 미적용)'

type PgErrorLike = { code?: string | null } | null | undefined

/** 42703 = undefined_column. 마이그레이션 미적용 상태를 500이 아니라 안내로 구분하기 위한 신호. */
export function isMissingColumnError(error: PgErrorLike): boolean {
  return error?.code === '42703'
}

/** 23505 = unique_violation. 중복 참가 신청을 409로 매핑할 때 사용한다. */
export function isUniqueViolation(error: PgErrorLike): boolean {
  return error?.code === '23505'
}

export function migrationRequiredResponse(): NextResponse {
  return NextResponse.json(
    { error: MIGRATION_REQUIRED_MESSAGE, migration_required: true },
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
  | { ok: true; game: GameRow }
  | { ok: false; response: NextResponse }

export async function fetchGame(gameId: string): Promise<FetchGameResult> {
  const { data, error } = await supabaseAdmin
    .from('custom_games')
    .select(GAME_COLUMNS)
    .eq('id', gameId)
    .maybeSingle()

  if (error) {
    if (isMissingColumnError(error)) return { ok: false, response: migrationRequiredResponse() }
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  if (!data) {
    return {
      ok: false,
      response: NextResponse.json({ error: '내전을 찾을 수 없습니다' }, { status: 404 }),
    }
  }

  return { ok: true, game: data as unknown as GameRow }
}
