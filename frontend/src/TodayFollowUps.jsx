import { useEffect, useState } from 'react'

function TodayFollowUps({ session, onSelectContact }) {
  const [followUps, setFollowUps] = useState(null)
  const [error, setError] = useState(null)

  const apiUrl = import.meta.env.VITE_API_URL
  const authHeaders = { Authorization: `Bearer ${session.access_token}` }

  useEffect(() => {
    fetch(`${apiUrl}/api/follow-ups/today`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setFollowUps(data) : setError(data.error)))
      .catch((err) => setError(err.message))
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
