import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { readPendingLog, clearPendingLog } from './pendingLog'
import './CallLogPrompt.css'

// Don't fire on a blink-fast tab switch (e.g. the OS's own "call this
// number?" confirmation flickering focus) — only once the agent was away
// long enough to plausibly have made the call or sent the message.
const MIN_AWAY_MS = 3000
// If they don't come back to Recall for hours, the moment's passed —
// silently drop the pending intent instead of surprising them with a stale
// prompt later.
const MAX_STALE_MS = 2 * 60 * 60 * 1000

function CallLogPrompt({ session, onLogged }) {
  const [prompt, setPrompt] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const token = session.access_token

  useEffect(() => {
    let hiddenAt = null

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }

      const pending = readPendingLog()
      if (!pending) return
      if (Date.now() - pending.startedAt > MAX_STALE_MS) {
        clearPendingLog()
        return
      }
      if (hiddenAt && Date.now() - hiddenAt < MIN_AWAY_MS) return

      setPrompt(pending)
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const handleSave = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      await apiFetch('/api/interactions', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: prompt.contactId, note_text: noteText, source: prompt.source }),
      })
      clearPendingLog()
      onLogged?.(prompt.contactId)
      setPrompt(null)
      setNoteText('')
      setSaving(false)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const handleDismiss = () => {
    clearPendingLog()
    setPrompt(null)
    setNoteText('')
    setError(null)
  }

  if (!prompt) return null

  const sourceLabel = prompt.source === 'call' ? 'call' : 'WhatsApp message'

  return (
    <div className="log-prompt-backdrop">
      <div className="log-prompt">
        <p className="log-prompt-title">
          Log this {sourceLabel} to {prompt.contactName}?
        </p>
        {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}
        <form onSubmit={handleSave}>
          <textarea
            aria-label="What was discussed?"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="What was discussed?"
            autoFocus
            required
          />
          <div className="log-prompt-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={handleDismiss} disabled={saving}>
              Not now
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CallLogPrompt
