import 'server-only'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isMissingColumnError } from '@/lib/db/pgErrors'
import type { RiotAccount } from '@/types/supabase'

/**
 * 대표 계정의 Riot ID *문자열*이 바뀌면 재승인을 요구할지 여부.
 * true인 이유: 검증 없이 Riot ID를 갈아끼우면 타인의 상위 티어 계정으로
 * 바꿔치기해 랭킹을 조작할 수 있다.
 */
export const REQUIRE_REAPPROVAL_ON_RIOT_ID_CHANGE = true

/**
 * 대표 계정을 "다른 계정으로 전환"할 때 재승인을 요구할지 여부.
 *
 * 현재 false — 단톡방 지인 한정 서비스라 악용 위험이 낮다는 운영 판단.
 * true로 바꾸면 부계정을 대표로 올리는 순간 pending으로 돌아가고 캐시도 함께
 * 갱신되므로("심사한 계정 ≠ 표시되는 값" 방지) 랭킹 조작 경로가 닫힌다.
 * 정책 반전은 이 상수 하나만 바꾸면 된다.
 */
export const REQUIRE_REAPPROVAL_ON_PRIMARY_SWITCH = false

const RIOT_ACCOUNT_COLUMNS_BASE =
  'id, member_id, account_no, is_primary, riot_game_name, riot_tagline, riot_puuid, ' +
  'tft_tier, tft_rank, tft_league_points, tft_wins, tft_losses, ' +
  'tft_doubleup_tier, tft_doubleup_rank, tft_doubleup_league_points, tft_doubleup_wins, tft_doubleup_losses, ' +
  'lol_tier, lol_rank, lol_league_points, lol_wins, lol_losses, lol_synced_at, ' +
  'last_synced_at, created_at'

/**
 * ★ `lol_puuid` 를 빼먹으면 listRiotAccounts 가 값을 안 가져와 매 동기화마다
 * account-v1 을 재호출한다(lint 로 안 잡히는 조용한 회귀 + rate limit 소모).
 */
export const RIOT_ACCOUNT_COLUMNS = `${RIOT_ACCOUNT_COLUMNS_BASE}, lol_puuid`

export const RIOT_ACCOUNTS_MIGRATION_MESSAGE =
  '다중 라이엇 계정 기능이 아직 활성화되지 않았습니다. 관리자에게 문의해주세요. (scripts/sql/20260726_riot_accounts.sql 미적용)'

type PgErrorLike = { code?: string | null } | null | undefined

/**
 * 42P01 = undefined_table (직접 SQL), PGRST205 = PostgREST 스키마 캐시에 테이블 없음.
 * 마이그레이션 미적용 상태를 500이 아니라 안내로 구분하기 위한 신호.
 */
export function isMissingTableError(error: PgErrorLike): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205'
}

/** 23505 = unique_violation. 슬롯 초과·중복 Riot ID·대표 중복을 409로 매핑할 때 사용한다. */
export function isUniqueViolation(error: PgErrorLike): boolean {
  return error?.code === '23505'
}

export function riotAccountsMigrationResponse(): NextResponse {
  return NextResponse.json(
    { ok: false, message: RIOT_ACCOUNTS_MIGRATION_MESSAGE, migration_required: true },
    { status: 503 },
  )
}

export type ListAccountsResult =
  | { ok: true; accounts: RiotAccount[] }
  | { ok: false; missingTable: boolean; message: string }

/** 대표 파생 정렬(is_primary desc, account_no asc)로 정렬된 계정 목록. */
export async function listRiotAccounts(memberId: string): Promise<ListAccountsResult> {
  const query = (columns: string) =>
    supabaseAdmin
      .from('riot_accounts')
      .select(columns)
      .eq('member_id', memberId)
      .order('account_no', { ascending: true })

  let { data, error } = await query(RIOT_ACCOUNT_COLUMNS)

  // 20260729_lol_puuid.sql 미적용이면 42703. 여기서 죽으면 크론 전체가 멈추므로
  // lol_puuid 없이 다시 읽고 null 로 채운다(LoL 단계만 캐시 없이 degrade).
  if (error && isMissingColumnError(error)) {
    ;({ data, error } = await query(RIOT_ACCOUNT_COLUMNS_BASE))
  }

  if (error) {
    return { ok: false, missingTable: isMissingTableError(error), message: error.message }
  }

  // 컬럼 목록이 문자열 결합이라 PostgREST 타입 추론이 걸리지 않는다.
  const rows = (data ?? []) as unknown as Array<Omit<RiotAccount, 'lol_puuid'> & { lol_puuid?: string | null }>
  return { ok: true, accounts: rows.map((row) => ({ ...row, lol_puuid: row.lol_puuid ?? null })) }
}

/**
 * 대표 계정 파생. `is_primary`가 전부 false여도 account_no 최솟값이 대표가 되므로
 * "대표 없음" 상태가 관측되지 않는다 → 자동 승격 UPDATE도, 승격 경합도 없다.
 */
export function pickPrimaryAccount<T extends { is_primary: boolean; account_no: number }>(
  accounts: T[],
): T | null {
  if (accounts.length === 0) return null
  return [...accounts].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1
    return a.account_no - b.account_no
  })[0]
}

/** 비어 있는 가장 작은 슬롯 번호. 없으면 null(=최대 개수 초과). */
export function nextAccountNo(accounts: { account_no: number }[]): number | null {
  const used = new Set(accounts.map((a) => a.account_no))
  for (let no = 1; no <= 3; no += 1) {
    if (!used.has(no)) return no
  }
  return null
}

/** 20260729_lol_puuid.sql 미적용 환경용. `lol_puuid`가 없으면 update 전체가 42703으로 죽는다. */
export const CLEARED_RANK_COLUMNS_LEGACY = {
  tft_tier: null,
  tft_rank: null,
  tft_league_points: null,
  tft_wins: null,
  tft_losses: null,
  tft_doubleup_tier: null,
  tft_doubleup_rank: null,
  tft_doubleup_league_points: null,
  tft_doubleup_wins: null,
  tft_doubleup_losses: null,
  lol_tier: null,
  lol_rank: null,
  lol_league_points: null,
  lol_wins: null,
  lol_losses: null,
  lol_synced_at: null,
  last_synced_at: null,
} as const

/**
 * Riot ID가 다른 계정으로 바뀌었을 때 무효화해야 하는 랭크 컬럼 일괄.
 *
 * ★ `lol_puuid: null` 은 보안상 필수다. 빼먹으면 Riot ID 를 다른 계정으로 바꿔도
 * 옛 lol_puuid 가 남아 다음 동기화에서 **남의 LoL 랭크가 내 랭킹에 표시**된다.
 */
export const CLEARED_RANK_COLUMNS = {
  ...CLEARED_RANK_COLUMNS_LEGACY,
  lol_puuid: null,
} as const

type MirrorOptions = {
  /** 배지용 이전 티어(tft_*_prev) 를 함께 기록할지. 동기화 경로에서만 true. */
  recordPrev?: boolean
}

export type MirrorResult =
  | { ok: true; primary: RiotAccount | null }
  | { ok: false; missingTable: boolean; message: string }

/**
 * ★ members.riot_* / tft_* / lol_* 캐시를 대표 계정 값으로 미러링하는 **유일한 지점**.
 *
 * 공개 랭킹(`/`, `/tft`, `/lol`, `/hall-of-fame`)은 전부 members 캐시만 읽는다.
 * 따라서 "members 캐시 == 대표 riot_accounts 값" 불변식이 깨지면 랭킹에 옛 값이 남는다.
 * 계정을 건드리는 모든 쓰기 경로는 반드시 이 함수를 통해서만 캐시를 갱신한다.
 */
export async function mirrorPrimaryToMember(
  memberId: string,
  options: MirrorOptions = {},
): Promise<MirrorResult> {
  const listed = await listRiotAccounts(memberId)
  if (!listed.ok) return listed

  const primary = pickPrimaryAccount(listed.accounts)
  if (!primary) {
    // 계정이 0개인 상태는 API가 막는다(마지막 1개 삭제 거부). 캐시는 그대로 둔다.
    return { ok: true, primary: null }
  }

  let prev: Record<string, string | number | null> = {}
  if (options.recordPrev) {
    const { data: current } = await supabaseAdmin
      .from('members')
      .select('tft_tier, tft_rank, tft_league_points')
      .eq('id', memberId)
      .maybeSingle()

    prev = {
      tft_tier_prev: current?.tft_tier ?? null,
      tft_rank_prev: current?.tft_rank ?? null,
      tft_lp_prev: current?.tft_league_points ?? null,
    }
  }

  const { error } = await supabaseAdmin
    .from('members')
    .update({
      riot_game_name: primary.riot_game_name,
      riot_tagline: primary.riot_tagline,
      riot_puuid: primary.riot_puuid,
      ...prev,
      tft_tier: primary.tft_tier,
      tft_rank: primary.tft_rank,
      tft_league_points: primary.tft_league_points,
      tft_wins: primary.tft_wins,
      tft_losses: primary.tft_losses,
      tft_doubleup_tier: primary.tft_doubleup_tier,
      tft_doubleup_rank: primary.tft_doubleup_rank,
      tft_doubleup_league_points: primary.tft_doubleup_league_points,
      tft_doubleup_wins: primary.tft_doubleup_wins,
      tft_doubleup_losses: primary.tft_doubleup_losses,
      lol_tier: primary.lol_tier,
      lol_rank: primary.lol_rank,
      lol_league_points: primary.lol_league_points,
      lol_wins: primary.lol_wins,
      lol_losses: primary.lol_losses,
      lol_synced_at: primary.lol_synced_at,
    })
    .eq('id', memberId)

  if (error) {
    return { ok: false, missingTable: false, message: error.message }
  }

  return { ok: true, primary }
}

/**
 * 심사 대상 값(= 대표 계정)이 바뀌었을 때 승인 상태를 되돌린다.
 * 캐시 갱신(mirrorPrimaryToMember)과 반드시 짝으로 호출한다. pending으로만 만들고
 * 옛 값을 남겨 두면 승인 순간 "심사한 계정 ≠ 표시되는 값"이 된다.
 */
export async function markMemberPending(memberId: string): Promise<string | null> {
  const { error } = await supabaseAdmin
    .from('members')
    .update({
      status: 'pending',
      requested_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
      rejected_reason: null,
    })
    .eq('id', memberId)

  return error?.message ?? null
}

/**
 * 멤버 생성 직후 slot 1 · 대표 계정을 만든다.
 * 테이블 부재(마이그레이션 미적용)는 기존 단일 계정 동작을 유지하기 위해 무시한다.
 */
export async function ensurePrimaryAccount(
  memberId: string,
  riotId: { riot_game_name: string; riot_tagline: string },
): Promise<{ ok: true } | { ok: false; conflict: boolean; message: string }> {
  const listed = await listRiotAccounts(memberId)
  if (!listed.ok) {
    if (listed.missingTable) return { ok: true }
    return { ok: false, conflict: false, message: listed.message }
  }

  const primary = pickPrimaryAccount(listed.accounts)
  if (primary) {
    const changed =
      primary.riot_game_name.toLowerCase() !== riotId.riot_game_name.toLowerCase() ||
      primary.riot_tagline.toLowerCase() !== riotId.riot_tagline.toLowerCase()
    if (!changed) return { ok: true }

    // Riot ID가 바뀌면 puuid·랭크는 다른 계정의 값이므로 다음 동기화까지 신뢰할 수 없다.
    const clearRiotId = (cleared: Record<string, null>) =>
      supabaseAdmin
        .from('riot_accounts')
        .update({
          riot_game_name: riotId.riot_game_name,
          riot_tagline: riotId.riot_tagline,
          riot_puuid: null,
          ...cleared,
        })
        .eq('id', primary.id)
        .eq('member_id', memberId)

    let { error } = await clearRiotId(CLEARED_RANK_COLUMNS)
    // 20260729 미적용이면 lol_puuid 가 없어 42703. 무효화 자체를 포기하면 안 되므로 나머지만 지운다.
    if (error && isMissingColumnError(error)) {
      ;({ error } = await clearRiotId(CLEARED_RANK_COLUMNS_LEGACY))
    }

    if (error) {
      return { ok: false, conflict: isUniqueViolation(error), message: error.message }
    }
    return { ok: true }
  }

  const { error } = await supabaseAdmin.from('riot_accounts').insert({
    member_id: memberId,
    account_no: 1,
    is_primary: true,
    riot_game_name: riotId.riot_game_name,
    riot_tagline: riotId.riot_tagline,
  })

  if (error) {
    if (isMissingTableError(error)) return { ok: true }
    return { ok: false, conflict: isUniqueViolation(error), message: error.message }
  }
  return { ok: true }
}
