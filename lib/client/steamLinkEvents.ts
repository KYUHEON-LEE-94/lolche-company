// 클라이언트 전용 이벤트 버스(키·외부 호출 없음). lib/steam/* 는 전부 'server-only' 경계라 여기 둔다.
//
// router.refresh() 는 서버 트리만 다시 받고 Client Component 상태는 유지하므로
// SharedWithMe·SteamPresence 의 자체 fetch 는 다시 돌지 않는다(개인화는 ISR 페이지 밖에서만 흐른다).
// 스팀 연결/해제 직후 이 이벤트로 두 섹션에 재조회를 알린다.
export const STEAM_LINK_CHANGED_EVENT = 'steam-link-changed'

export function notifySteamLinkChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(STEAM_LINK_CHANGED_EVENT))
}
