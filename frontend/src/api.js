const DEFAULT_TIMEOUT_MS = 10000

// Single place every component fetches through, instead of five
// slightly-different hand-rolled versions of the same three things:
// - res.ok is always checked before the caller sees data (a non-2xx body
//   was twice mistaken for real data elsewhere in this app already)
// - a hard timeout aborts a request that just hangs, not only ones that
//   error — AbortController alone doesn't cover a backend that never
//   responds
// - an external `signal` (e.g. a component's own unmount/contactId-change
//   controller) composes with the timeout: either firing aborts the fetch
export async function apiFetch(path, { token, signal, timeoutMs = DEFAULT_TIMEOUT_MS, ...options } = {}) {
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  signal?.addEventListener('abort', onExternalAbort)
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(`${import.meta.env.VITE_API_URL}${path}`, {
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error((data.errors && data.errors.join(', ')) || data.error || 'Something went wrong')
    }
    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(signal?.aborted ? 'cancelled' : 'Request timed out. Please check your connection and try again.')
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onExternalAbort)
  }
}
