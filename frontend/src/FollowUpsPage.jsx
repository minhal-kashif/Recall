import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import Chip from './Chip'
import { bucketFor, whenLabel } from './followUpBuckets'
import './FollowUpsPage.css'

// A large lookahead effectively returns every pending follow-up — the API
// already orders by due_date ascending, so this is soonest-first for free.
const ALL_UPCOMING_DAYS = 3650

const BUCKET_TABS = [
  { value: '', label: 'All' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
]

function FollowUpsPage({ session, onSelectContact }) {
  const [followUps, setFollowUps] = useState(null)
  const [error, setError] = useState(null)
  const [bucketFilter, setBucketFilter] = useState('')

  const token = session.access_token

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`/api/follow-ups/today?upcoming_days=${ALL_UPCOMING_DAYS}`, { token, signal: controller.signal })
      .then((data) => (Array.isArray(data) ? setFollowUps(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visible = followUps ? followUps.filter((f) => !bucketFilter || bucketFor(f.due_date) === bucketFilter) : []

  return (
    <div>
      <h2 className="registry-title followups-page-title">Follow-up Ledger</h2>

      <div className="pipe-tabs" role="group" aria-label="Filter by status">
        {BUCKET_TABS.map((t, i) => (
          <span key={t.value || 'all'} style={{ display: 'contents' }}>
            {i > 0 && <span className="pipe-tab-sep">|</span>}
            <button
              type="button"
              className={`pipe-tab${bucketFilter === t.value ? ' active' : ''}`}
              aria-pressed={bucketFilter === t.value}
              onClick={() => setBucketFilter(t.value)}
            >
              {t.label}
            </button>
          </span>
        ))}
      </div>

      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      {followUps === null ? (
        <p>Loading...</p>
      ) : visible.length === 0 ? (
        <p>No follow-ups match.</p>
      ) : (
        visible.map((f) => {
          const bucket = bucketFor(f.due_date)
          return (
            <button type="button" className="followup-entry" key={f.id} onClick={() => onSelectContact(f.contact_id)}>
              <div className="entry-top">
                <span className="entry-name">{f.contact_name || 'Unknown contact'}</span>
                <Chip tone={bucket}>{bucket === 'overdue' ? 'Overdue' : bucket === 'today' ? 'Today' : 'Upcoming'}</Chip>
              </div>
              <p className="entry-what">{f.description}</p>
              <span className="entry-when">{whenLabel(f.due_date, bucket)}</span>
            </button>
          )
        })
      )}
    </div>
  )
}

export default FollowUpsPage
