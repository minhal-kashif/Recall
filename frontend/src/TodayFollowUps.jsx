import { useEffect, useState } from 'react'
import { apiFetch } from './api'

function TodayFollowUps({ session, onSelectContact }) {
  const [followUps, setFollowUps] = useState(null)
  const [error, setError] = useState(null)

  const token = session.access_token

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/follow-ups/today', { token, signal: controller.signal })
      .then((data) => (Array.isArray(data) ? setFollowUps(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div>
      <h2>Today's Follow-Ups</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {followUps === null ? (
        <p>Loading...</p>
      ) : followUps.length === 0 ? (
        <p>Nothing due today. You're all caught up.</p>
      ) : (
        <ul>
          {followUps.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => onSelectContact(f.contact_id)}>
                {f.contact_name || 'Unknown contact'} — {f.description} — due {new Date(f.due_date).toLocaleString()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default TodayFollowUps
