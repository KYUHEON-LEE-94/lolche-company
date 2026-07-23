// 빌드 타임에 인라인되는 NEXT_PUBLIC_* 플래그.
// 반드시 process.env.NEXT_PUBLIC_XXX 전체 표현식을 그대로 써야 Next 가 치환한다.

/**
 * LoL 기능 활성화 여부.
 *
 * Riot 프로덕션 키의 LoL 제품 권한이 아직 승인되지 않아
 * (`/lol/league/v4/*`, `/lol/summoner/v4/*` 가 403) 기본값은 비활성이다.
 * 승인 후 `NEXT_PUBLIC_LOL_ENABLED=true` 로 바꾸고 재빌드하면
 * 네비게이션·대시보드 카드·`/lol` 페이지·동기화 단계가 모두 함께 켜진다.
 */
export const LOL_ENABLED = process.env.NEXT_PUBLIC_LOL_ENABLED === 'true'
