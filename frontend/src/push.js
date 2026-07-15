// Converts a base64url VAPID public key into the Uint8Array format the
// PushManager API expects.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)))
}

// Requests notification permission (no-ops if already decided) and, if
// granted, subscribes this device and saves the subscription server-side.
// Safe to call on every login — subscribing again with an existing
// subscription just returns the same one, and the backend upserts.
export async function setupPushNotifications(session) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) return

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return

  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY),
    })
  }

  await fetch(`${import.meta.env.VITE_API_URL}/api/push-subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  })
}
