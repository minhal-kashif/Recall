import { apiFetch } from './api'

export function uploadListingPhoto({ listingId, file, token }) {
  const form = new FormData()
  form.append('photo', file)

  return apiFetch(`/api/listings/${listingId}/photo`, { token, method: 'POST', body: form, timeoutMs: 30000 })
}
