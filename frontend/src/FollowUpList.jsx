import { useEffect, useState } from 'react'

function FollowUpList({ session, contactId }) {
  const [followUps, setFollowUps] = useState([])
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [rescheduleDates, setRescheduleDates] = useState({})
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL
  const authHeaders = { Authorization: `Bearer ${session.access_token}` }

  const loadFollowUps = () => {
    fetch(`${apiUrl}/api/follow-ups/${contactId}`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setFollowUps(data) : setError(data.error)))
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    loadFollowUps()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  const handleAdd = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`${apiUrl}/api/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ contact_id: contactId, description, due_date: dueDate }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError((data.errors && data.errors.join(', ')) || data.error || 'Something went wrong')
        setSubmitting(false)
        return
      }
      setDescription('')
      setDueDate('')
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
      const res = await fetch(`${apiUrl}/api/follow-ups/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError((data.errors && data.errors.join(', ')) || data.error || 'Something went wrong')
        return
      }
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
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What to do (e.g. Show Phase 8 unit)"
          required
        />
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
        />
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Add follow-up'}
        </button>
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
                  <input
                    type="datetime-local"
                    value={rescheduleValueFor(f.id)}
                    onChange={(e) => setRescheduleValueFor(f.id, e.target.value)}
                  />{' '}
                  <button
                    type="button"
                    disabled={!rescheduleValueFor(f.id)}
                    onClick={() => updateFollowUp(f.id, { status: 'snoozed', due_date: rescheduleValueFor(f.id) })}
                  >
                    Snooze
                  </button>{' '}
                  <button
                    type="button"
                    disabled={!rescheduleValueFor(f.id)}
                    onClick={() => updateFollowUp(f.id, { status: 'pending', due_date: rescheduleValueFor(f.id) })}
                  >
                    Reschedule
                  </button>
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
