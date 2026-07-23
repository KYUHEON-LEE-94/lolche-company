/**
 * 마이그레이션 미적용 상태를 500이 아니라 안내로 degrade 하기 위한 Postgres/PostgREST
 * 에러코드 판별 헬퍼. 서버·클라이언트 어느 쪽에서도 안전한 순수 함수만 둔다.
 */
export type PgErrorLike = { code?: string | null } | null | undefined

/** 42703 = undefined_column */
export function isMissingColumnError(error: PgErrorLike): boolean {
  return error?.code === '42703'
}

/** 23505 = unique_violation */
export function isUniqueViolation(error: PgErrorLike): boolean {
  return error?.code === '23505'
}

/** 23514 = check_violation. DB CHECK가 앱보다 엄격한 구버전 스키마 신호. */
export function isCheckViolation(error: PgErrorLike): boolean {
  return error?.code === '23514'
}

/**
 * RPC 부재. PostgREST는 스키마 캐시에서 함수를 못 찾으면 PGRST202를,
 * Postgres는 42883(undefined_function)을 돌려준다.
 */
export function isMissingFunctionError(error: PgErrorLike): boolean {
  return error?.code === 'PGRST202' || error?.code === '42883'
}
