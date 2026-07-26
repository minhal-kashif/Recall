import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import Chip from './Chip'
import DueDateTimeInput, { todayDateString, isFutureDateTime } from './DueDateTimeInput'
import './FollowUpList.css'

function FollowUpList({ session, contactId, onChange }) {
  const [followUps, setFollowUps] = useState([])
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [rescheduleDates, setRescheduleDates] = useState({})
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [addFormResetKey, setAddFormResetKey] = useState(0)

  const token = session.access_token
  const minDate = todayDateString()

  // Optional signal, same reasoning as ContactDetail's loadContact: only the
  // mount/contactId-change effect needs abort wiring, manual reloads after an
  // action don't race anything.
  const loadFollowUps = (signal) => {
    apiFetch(`/api/follow-ups/${contactId}`, { token, signal })
      .then((data) => (Array.isArray(data) ? setFollowUps(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadFollowUps(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  const handleAdd = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await apiFetch('/api/follow-ups', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, description, due_date: dueDate }),
      })
      setDescription('')
      setDueDate('')
      setAddFormResetKey((k) => k + 1)
      loadFollowUps()
      setSubmitting(false)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const updateFollowUp = async (id, body) => {
    setError(null)
    try {
      await apiFetch(`/api/follow-ups/${id}`, {
        method: 'PATCH',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      loadFollowUps()
      onChange?.()
    } catch (err) {
      setError(err.message)
    }
  }

  const rescheduleValueFor = (id) => rescheduleDates[id] || ''
  const setRescheduleValueFor = (id, value) => setRescheduleDates({ ...rescheduleDates, [id]: value })

  return (
    <section>
      <p className="section-label">Follow-ups</p>
      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      <form onSubmit={handleAdd} className="followup-form">
        <input
          aria-label="What to do"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What to do (e.g. Show Phase 8 unit)"
          required
        />
        <DueDateTimeInput
          key={addFormResetKey}
          value={dueDate}
          onChange={setDueDate}
          minDate={minDate}
          label="New follow-up"
        />
        <button type="submit" disabled={submitting || !isFutureDateTime(dueDate)}>
          {submitting ? 'Saving...' : 'Add follow-up'}
        </button>
        {dueDate && !isFutureDateTime(dueDate) && (
          <p className="field-warning">That date and time have already passed — please pick a future one.</p>
        )}
      </form>

      {followUps.length === 0 ? (
        <p>No follow-ups yet.</p>
      ) : (
        <ul>
          {followUps.map((f) => (
            <li key={f.id} className="followup-row">
              <div className="followup-row-top">
                <Chip tone={f.status}>{f.status}</Chip>
                <span className="followup-row-due">due {new Date(f.due_date).toLocaleString()}</span>
              </div>
              <p className="followup-row-desc">{f.description}</p>
              {f.status !== 'done' && (
                <div className="followup-row-actions">
                  <button type="button" onClick={() => updateFollowUp(f.id, { status: 'done' })}>
                    Mark done
                  </button>
                  <DueDateTimeInput
                    value={rescheduleValueFor(f.id)}
                    onChange={(value) => setRescheduleValueFor(f.id, value)}
                    minDate={minDate}
                    label="Reschedule"
                  />
                  <button
                    type="button"
                    disabled={!isFutureDateTime(rescheduleValueFor(f.id))}
                    onClick={() => updateFollowUp(f.id, { status: 'snoozed', due_date: rescheduleValueFor(f.id) })}
                  >
                    Snooze
                  </button>
                  <button
                    type="button"
                    disabled={!isFutureDateTime(rescheduleValueFor(f.id))}
                    onClick={() => updateFollowUp(f.id, { status: 'pending', due_date: rescheduleValueFor(f.id) })}
                  >
                    Reschedule
                  </button>
                  {rescheduleValueFor(f.id) && !isFutureDateTime(rescheduleValueFor(f.id)) && (
                    <p className="field-warning">That date and time have already passed.</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default FollowUpList
