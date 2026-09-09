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
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if (client.url.includes(url) && 'focus' in client) return client.focus()
      }
      return self.clients.openWindow(url)
    })(),
  )
})
