/**
 * VAPID 공개키(base64url 문자열)를 `pushManager.subscribe` 가 요구하는 바이트 배열로 변환한다.
 * 브라우저에서만 쓰이는 순수 함수라 `server-only` 를 붙이지 않는다.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}
