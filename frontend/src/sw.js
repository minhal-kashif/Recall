self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Chrome's installability check (the thing that makes "Add to Home Screen"
// produce a real standalone app instead of a bare bookmark shortcut)
// requires the service worker to have a fetch handler. No offline caching
// is implemented here — this only needs to exist.
//
// Same-origin only, deliberately: re-issuing a *cross-origin* request via
// fetch(event.request) breaks no-cors image loads. Listing photos and voice
// notes come from Supabase Storage as opaque no-cors requests, and passing
// them back through fetch() here made Supabase's CDN reject them with a 503,
// so every listing photo silently rendered blank. Cross-origin requests must
// be left untouched for the browser to handle natively.
self.addEventListener('fetch', (event) => {
  if (new URL(event.request.url).origin !== self.location.origin) return
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
