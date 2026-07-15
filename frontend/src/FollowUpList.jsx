import { useEffect, useState } from 'react'
import { apiFetch } from './api'

const HOURS_12 = Array.from({ length: 12 }, (_, i) => i + 1)
const MINUTES = ['00', '15', '30', '45']

function todayDateString() {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

// Splits a "YYYY-MM-DDTHH:mm" value (the same format the old datetime-local
// input used) into date/hour(12h)/minute/am-per-pm parts for the selects below.
function parseDueDateParts(value) {
  if (!value) return { date: '', hour12: '', minute: '', ampm: '' }
  const [date, time] = value.split('T')
  if (!time) return { date, hour12: '', minute: '', ampm: '' }
  const [hStr, mStr] = time.split(':')
  const h = Number(hStr)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return { date, hour12: String(hour12), minute: mStr, ampm }
}

// Inverse of parseDueDateParts — empty unless all four parts are chosen, so
// callers can gate submit buttons on "is this actually a complete value" for
// free instead of relying on native input validation.
function composeDueDateValue({ date, hour12, minute, ampm }) {
  if (!date || !hour12 || !minute || !ampm) return ''
  let h = Number(hour12) % 12
  if (ampm === 'PM') h += 12
  return `${date}T${String(h).padStart(2, '0')}:${minute}`
}

function isFutureDateTime(value) {
  if (!value) return false
  const parsed = new Date(value)
  return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()
}

// Date picker + explicit Hour/Minute/AM-PM dropdowns, instead of a native
// datetime-local input — that widget validates its internal segments on
// blur (producing a confusing "invalid" popup before the user ever submits)
// and makes AM/PM a type-to-set segment rather than something you pick.
//
// Holds the in-progress selection in its own state rather than deriving it
// fresh from `value` every render: composeDueDateValue only returns a
// non-empty string once all four parts are filled, so a naive "derive from
// value" approach would erase a just-picked date the instant it's reported
// upward, since the round-tripped value is still '' until hour/min/AM-PM
// are also chosen. Parent can still force a reset (e.g. after a successful
// submit) by changing this component's `key`.
function DueDateTimeInput({ value, onChange, minDate, label }) {
  const [parts, setParts] = useState(() => parseDueDateParts(value))
  const update = (patch) => {
    const next = { ...parts, ...patch }
    setParts(next)
    onChange(composeDueDateValue(next))
  }

  return (
    <span>
      <input
        type="date"
        aria-label={`${label} date`}
        value={parts.date}
        min={minDate}
        onChange={(e) => update({ date: e.target.value })}
      />{' '}
      <select aria-label={`${label} hour`} value={parts.hour12} onChange={(e) => update({ hour12: e.target.value })}>
        <option value="">Hour</option>
        {HOURS_12.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>{' '}
      <select aria-label={`${label} minute`} value={parts.minute} onChange={(e) => update({ minute: e.target.value })}>
        <option value="">Min</option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>{' '}
      <select aria-label={`${label} AM or PM`} value={parts.ampm} onChange={(e) => update({ ampm: e.target.value })}>
        <option value="">AM/PM</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </span>
  )
}

function FollowUpList({ session, contactId }) {
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
    } catch (err) {
      setError(err.message)
    }
  }

  const rescheduleValueFor = (id) => rescheduleDates[id] || ''
  const setRescheduleValueFor = (id, value) => setRescheduleDates({ ...rescheduleDates, [id]: value })

  return (
    <section>
      <h3>Follow-ups</h3>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <form onSubmit={handleAdd}>
        <input
          aria-label="What to do"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What to do (e.g. Show Phase 8 unit)"
          required
        />{' '}
        <DueDateTimeInput
          key={addFormResetKey}
          value={dueDate}
          onChange={setDueDate}
          minDate={minDate}
          label="New follow-up"
        />{' '}
        <button type="submit" disabled={submitting || !isFutureDateTime(dueDate)}>
          {submitting ? 'Saving...' : 'Add follow-up'}
        </button>
        {dueDate && !isFutureDateTime(dueDate) && (
          <p style={{ color: '#b45309' }}>That date and time have already passed — please pick a future one.</p>
        )}
      </form>

      {followUps.length === 0 ? (
        <p>No follow-ups yet.</p>
      ) : (
        <ul>
          {followUps.map((f) => (
            <li key={f.id}>
              <strong>{f.status}</strong> — {f.description} — due {new Date(f.due_date).toLocaleString()}
              {f.status !== 'done' && (
                <>
                  {' '}
                  <button type="button" onClick={() => updateFollowUp(f.id, { status: 'done' })}>
                    Mark done
                  </button>{' '}
                  <DueDateTimeInput
                    value={rescheduleValueFor(f.id)}
                    onChange={(value) => setRescheduleValueFor(f.id, value)}
                    minDate={minDate}
                    label="Reschedule"
                  />{' '}
                  <button
                    type="button"
                    disabled={!isFutureDateTime(rescheduleValueFor(f.id))}
                    onClick={() => updateFollowUp(f.id, { status: 'snoozed', due_date: rescheduleValueFor(f.id) })}
                  >
                    Snooze
                  </button>{' '}
                  <button
                    type="button"
                    disabled={!isFutureDateTime(rescheduleValueFor(f.id))}
                    onClick={() => updateFollowUp(f.id, { status: 'pending', due_date: rescheduleValueFor(f.id) })}
                  >
                    Reschedule
                  </button>
                  {rescheduleValueFor(f.id) && !isFutureDateTime(rescheduleValueFor(f.id)) && (
                    <span style={{ color: '#b45309' }}> That date and time have already passed.</span>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default FollowUpList
