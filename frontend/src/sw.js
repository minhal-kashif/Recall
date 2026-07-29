self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Chrome's installability check (the thing that makes "Add to Home Screen"
// produce a real standalone app instead of a bare bookmark shortcut)
// requires the service worker to actually handle fetch — a trivial
// passthrough is enough, no offline caching implemented here.
self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'Recall', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'Recall'
  const options = {
    body: payload.body || '',
    icon: '/icon-512.png',
    badge: '/notification-badge.png',
    data: { contactId: payload.contactId || null },
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const contactId = event.notification.data && event.notification.data.contactId
  const targetUrl = contactId ? `/?contact=${contactId}` : '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
