/**
 * 마이그레이션 미적용 상태를 500이 아니라 안내로 degrade 하기 위한 Postgres/PostgREST
 * 에러코드 판별 헬퍼. 서버·클라이언트 어느 쪽에서도 안전한 순수 함수만 둔다.
 */
export type PgErrorLike = { code?: string | null } | null | undefined

/**
 * 컬럼 부재.
 *
 * ★ 코드가 두 개다. SELECT 는 쿼리가 Postgres 까지 도달해 42703(undefined_column)이 나지만,
 * INSERT/UPDATE 의 **payload 키**는 PostgREST 가 스키마 캐시에서 먼저 걸러 PGRST204 를 돌려준다.
 * 42703 만 보면 쓰기 경로의 degrade 가 통째로 발동하지 않는다(실측 확인).
 * `isMissingFunctionError` 가 PGRST202/42883 둘 다 보는 것과 같은 이유다.
 */
export function isMissingColumnError(error: PgErrorLike): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
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
