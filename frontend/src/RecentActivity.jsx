import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import Chip from './Chip'
import './ActivityTimeline.css'

const KIND_LABELS = {
  manual: 'Note',
  call: 'Call',
  whatsapp: 'WhatsApp',
  voice: 'Voice note',
  done: 'Follow-up done',
  overdue: 'Task overdue',
}

function relativeDate(dateString) {
  const date = new Date(dateString)
  const diffDays = Math.round((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

// Cross-contact version of ActivityTimeline — "what's been happening" across
// the whole book of business instead of one contact, for the Home screen.
function RecentActivity({ session, onSelectContact }) {
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/activity/recent?limit=8', { token: session.access_token, signal: controller.signal })
      .then((data) => (Array.isArray(data) ? setEntries(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (error) return <p style={{ color: 'var(--brick-text)' }}>{error}</p>
  if (entries !== null && entries.length === 0) return null

  return (
    <div className="recent-activity">
      <p className="section-label">Recent activity</p>
      {entries === null ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id} className="tl-row">
              <span className={`tl-dot tl-dot-${entry.kind}`}></span>
              <button
                type="button"
                className="activity-entry-body tl-body"
                onClick={() => onSelectContact(entry.contact_id)}
              >
                <div className="tl-top">
                  <span className="tl-kind">
                    {KIND_LABELS[entry.kind] || entry.kind}
                    {entry.contact_name ? ` · ${entry.contact_name}` : ''}
                  </span>
                  <span className="tl-date">{relativeDate(entry.date)}</span>
                </div>
                <p className="tl-text">{entry.text}</p>
                {entry.kind === 'overdue' && <Chip tone="overdue">Flagged</Chip>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default RecentActivity
