// Converts a base64url VAPID public key into the Uint8Array format the
// PushManager API expects.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`timed out waiting for ${label}`)), ms)),
  ])
}

// Requests notification permission (no-ops if already decided) and, if
// granted, subscribes this device and saves the subscription server-side.
// Safe to call on every login — subscribing again with an existing
// subscription just returns the same one, and the backend upserts.
// Returns a status object instead of throwing, with a bounded timeout on
// each step, so a caller can diagnose exactly where this stopped.
export async function setupPushNotifications(session, onProgress) {
  const report = (step) => onProgress && onProgress(step)

  try {
    report('checking support')
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, step: 'unsupported', detail: 'serviceWorker/PushManager not available' }
    }
    if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) {
      return { ok: false, step: 'config', detail: 'VITE_VAPID_PUBLIC_KEY missing' }
    }

    report('requesting permission')
    const permission = await withTimeout(Notification.requestPermission(), 15000, 'Notification.requestPermission')
    if (permission !== 'granted') {
      return { ok: false, step: 'permission', detail: permission }
    }

    report('waiting for service worker')
    let registration
    try {
      registration = await withTimeout(navigator.serviceWorker.ready, 10000, 'serviceWorker.ready')
    } catch (readyErr) {
      const existing = await navigator.serviceWorker.getRegistrations()
      const summary = existing.length
        ? existing
            .map((r) => `scope=${r.scope} installing=${!!r.installing} waiting=${!!r.waiting} active=${!!r.active}`)
            .join(' | ')
        : 'no registrations found at all'
      return { ok: false, step: 'exception', detail: `${readyErr.message} — ${summary}` }
    }

    report('checking existing subscription')
    let subscription = await withTimeout(
      registration.pushManager.getSubscription(),
      10000,
      'pushManager.getSubscription',
    )

    if (!subscription) {
      report('subscribing')
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
        }),
        15000,
        'pushManager.subscribe',
      )
    }

    report('saving subscription')
    const res = await withTimeout(
      fetch(`${import.meta.env.VITE_API_URL}/api/push-subscriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      }),
      10000,
      'POST /api/push-subscriptions',
    )

    if (!res.ok) {
      const body = await res.text()
      return { ok: false, step: 'save', detail: `${res.status} ${body}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, step: 'exception', detail: err && err.message ? err.message : String(err) }
  }
}
