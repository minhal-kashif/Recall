import { apiFetch } from './api'

export function uploadVoiceNote({ contactId, blob, durationSeconds, token }) {
  const form = new FormData()
  form.append('contact_id', contactId)
  if (durationSeconds) form.append('duration_seconds', String(durationSeconds))
  form.append('audio', blob, 'note.webm')

  return apiFetch('/api/voice-notes', { token, method: 'POST', body: form, timeoutMs: 30000 })
}
