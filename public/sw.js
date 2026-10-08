// 롤체 컴퍼니 웹 푸시 서비스 워커.
// 정적 파일이라 빌드 대상이 아니고, proxy matcher 의 "확장자 있는 요청" 제외 규칙에 걸려
// 미로그인 상태에서도 200 으로 서빙된다(서비스 워커 등록에 필수).

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }
  const title = data.title || '롤체 컴퍼니'
  const options = {
    body: data.body || '내전이 곧 시작합니다.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'custom-game-reminder',
    data: { url: data.url || '/custom-games' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/custom-games'
  event.waitUntil(
    (async () => {
      // includes() 부분 일치는 /custom-games 가 /custom-games/<id> 탭을 잡아 엉뚱한 내전을 띄웠다.
      // 절대 URL 정확 일치 → 같은 출처의 열린 탭을 이동 → 새 창 순으로 처리한다.
      const target = new URL(url, self.location.origin).href
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const same = all.filter((c) => new URL(c.url).origin === self.location.origin)
      const exact = same.find((c) => c.url === target)
      if (exact) return exact.focus()
      const client = same.find((c) => c.focused) || same[0]
      if (client) {
        try {
          // focus 는 사용자 활성화(알림 클릭) 시간 제한이 있어 navigate 보다 먼저 호출한다.
          const focused = await client.focus()
          await (focused || client).navigate(target)
          return
        } catch {
          // 이 워커가 제어하지 않는 탭은 navigate 가 거부된다 — 새 창으로 폴백.
        }
      }
      return self.clients.openWindow(target)
    })(),
  )
})
