import { useState } from 'react'
import { apiFetch } from './api'
import DueDateTimeInput, { todayDateString, isFutureDateTime } from './DueDateTimeInput'
import './CallLogPrompt.css'
import './LogCallModal.css'

// Simplified from Salesforce/Follow Up Boss's full outcome picklist down to
// the handful an individual agent actually needs.
const OUTCOMES = [
  'Connected — interested',
  'Connected — not interested',
  'Left voicemail',
  'No answer',
  'Wrong number',
  'Requested callback',
]

function LogCallModal({ session, contactId, contactName, onClose, onLogged }) {
  const [outcome, setOutcome] = useState(OUTCOMES[0])
  const [notes, setNotes] = useState('')
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false)
  const [followUpDescription, setFollowUpDescription] = useState('')
  const [followUpDue, setFollowUpDue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const token = session.access_token
  const minDate = todayDateString()
  const followUpReady = !scheduleFollowUp || isFutureDateTime(followUpDue)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    const noteText = notes.trim() ? `${outcome} — ${notes.trim()}` : outcome

    try {
      await apiFetch('/api/interactions', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, note_text: noteText, source: 'call' }),
      })

      if (scheduleFollowUp && isFutureDateTime(followUpDue)) {
        await apiFetch('/api/follow-ups', {
          method: 'POST',
          token,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contact_id: contactId,
            description: followUpDescription.trim() || 'Follow up on call',
            due_date: followUpDue,
          }),
        })
      }

      onLogged?.()
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="log-prompt-backdrop" onClick={onClose}>
      <div className="log-prompt" onClick={(e) => e.stopPropagation()}>
        <p className="log-prompt-title">Log a call with {contactName}</p>
        {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

        <form onSubmit={handleSubmit}>
          <label>
            Outcome
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </label>

          <textarea
            aria-label="Additional notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes (optional)"
          />

          <label className="sequence-toggle log-call-schedule-toggle">
            <input
              type="checkbox"
              checked={scheduleFollowUp}
              onChange={(e) => setScheduleFollowUp(e.target.checked)}
            />{' '}
            Schedule a follow-up
          </label>

          {scheduleFollowUp && (
            <div className="log-call-followup-fields">
              <input
                aria-label="Follow-up description"
                value={followUpDescription}
                onChange={(e) => setFollowUpDescription(e.target.value)}
                placeholder="What to do (e.g. Call back with pricing)"
              />
              <DueDateTimeInput value={followUpDue} onChange={setFollowUpDue} minDate={minDate} label="Follow-up" />
              {followUpDue && !isFutureDateTime(followUpDue) && (
                <p className="field-warning">That date and time have already passed — please pick a future one.</p>
              )}
            </div>
          )}

          <div className="log-prompt-actions">
            <button type="submit" disabled={saving || !followUpReady}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default LogCallModal
