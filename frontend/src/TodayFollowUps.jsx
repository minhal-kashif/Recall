import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import Chip from './Chip'
import ListingCard from './ListingCard'
import RecentActivity from './RecentActivity'
import { bucketFor, whenLabel } from './followUpBuckets'
import './TodayFollowUps.css'

function todayStamp() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
}

const SECTIONS = [
  { bucket: 'overdue', label: 'Overdue', chipLabel: 'Overdue' },
  { bucket: 'today', label: 'Today', chipLabel: 'Today' },
  { bucket: 'upcoming', label: 'Upcoming', chipLabel: 'Upcoming' },
]

function daysSince(dateString) {
  if (!dateString) return null
  const ms = Date.now() - new Date(dateString).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

// Buckets a list of dates into day-offset slots relative to today (e.g.
// offsets [-4..0] for "last 5 days", [0..4] for "next 5 days") — powers the
// two trend-bar widgets from real data instead of a fabricated metric.
function bucketCountsByDayOffset(dates, offsets) {
  const today = startOfDay(new Date()).getTime()
  const counts = offsets.map(() => 0)
  dates.forEach((d) => {
    const diff = Math.round((startOfDay(d).getTime() - today) / (1000 * 60 * 60 * 24))
    const idx = offsets.indexOf(diff)
    if (idx !== -1) counts[idx] += 1
  })
  return counts
}

function TrendWidget({ label, value, counts }) {
  const max = Math.max(1, ...counts)
  return (
    <div className="trend-widget">
      <p className="stat-pair-label">{label}</p>
      <div className="trend-bars">
        {counts.map((c, i) => (
          <span
            key={i}
            className={`trend-bar${i === counts.length - 1 ? ' trend-bar-accent' : ''}`}
            style={{ height: `${Math.max(10, (c / max) * 100)}%` }}
          />
        ))}
      </div>
      <p className="stat-pair-value">{value}</p>
    </div>
  )
}

function TodayFollowUps({
  session,
  onSelectContact,
  onOpenContacts,
  onSelectListing,
  onAddContact,
  onAddListing,
  onOpenFollowUps,
  onOpenSettings,
}) {
  const [followUps, setFollowUps] = useState(null)
  const [error, setError] = useState(null)
  const [allContacts, setAllContacts] = useState(null)
  const [quietContacts, setQuietContacts] = useState(null)
  const [nextUp, setNextUp] = useState(null)
  const [featuredListings, setFeaturedListings] = useState(null)

  const token = session.access_token
  const displayName = session.user.user_metadata?.full_name || session.user.email
  const avatarUrl = session.user.user_metadata?.avatar_url

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/follow-ups/today', { token, signal: controller.signal })
      .then((data) => (Array.isArray(data) ? setFollowUps(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    Promise.all([
      apiFetch('/api/contacts', { token, signal: controller.signal }),
      apiFetch('/api/contacts?stale_days=7', { token, signal: controller.signal }),
    ])
      .then(([all, quiet]) => {
        if (Array.isArray(all)) setAllContacts(all)
        if (Array.isArray(quiet)) setQuietContacts(quiet)
      })
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    apiFetch('/api/listings?featured=true', { token, signal: controller.signal })
      .then((data) => {
        if (Array.isArray(data)) setFeaturedListings(data)
      })
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Unstarring here should drop the card immediately rather than leaving a
  // now-stale "featured" card sitting in a list that's meant to only ever
  // show starred listings.
  const handleToggleFeatured = async (id, nextFeatured) => {
    setFeaturedListings((prev) => (nextFeatured ? prev : prev.filter((l) => l.id !== id)))
    try {
      await apiFetch(`/api/listings/${id}`, {
        method: 'PATCH',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: nextFeatured }),
      })
    } catch (err) {
      setError(err.message)
    }
  }

  // Nothing due within the normal window — look further out so the empty
  // state can still say something useful instead of just "you're done".
  useEffect(() => {
    if (followUps === null || followUps.length > 0) return
    const controller = new AbortController()
    apiFetch('/api/follow-ups/today?upcoming_days=365', { token, signal: controller.signal })
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) setNextUp(data[0])
      })
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [followUps])

  const overdueCount = followUps ? followUps.filter((f) => bucketFor(f.due_date) === 'overdue').length : 0
  const todayCount = followUps ? followUps.filter((f) => bucketFor(f.due_date) === 'today').length : 0
  const statsReady = followUps !== null && allContacts !== null && quietContacts !== null

  const newContactsWeek = allContacts
    ? allContacts.filter((c) => Date.now() - new Date(c.created_at).getTime() <= 7 * 24 * 60 * 60 * 1000).length
    : 0
  const newContactsTrend = allContacts ? bucketCountsByDayOffset(allContacts.map((c) => c.created_at), [-4, -3, -2, -1, 0]) : []
  const followUpsTrend = followUps
    ? bucketCountsByDayOffset(
        followUps.map((f) => f.due_date),
        [0, 1, 2, 3, 4],
      )
    : []

  return (
    <div>
      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      <div className="home-header">
        <div>
          <span className="home-eyebrow">Today's ledger — {todayStamp()}</span>
          <h1 className="home-name">{displayName}</h1>
        </div>
        {avatarUrl && (
          <button type="button" className="home-avatar-btn" onClick={onOpenSettings} aria-label="Open settings">
            <img className="home-avatar" src={avatarUrl} alt="" />
          </button>
        )}
      </div>

      <div className="quick-actions-row">
        <button type="button" className="ledger-btn-outline" onClick={onAddContact}>
          + New contact
        </button>
        <button type="button" className="ledger-btn-outline" onClick={onAddListing}>
          + Add property
        </button>
      </div>

      {featuredListings && featuredListings.length > 0 && (
        <div className="featured-section">
          <p className="section-label">Featured listings</p>
          <ul className="featured-strip">
            {featuredListings.map((l) => (
              <ListingCard
                key={l.id}
                listing={l}
                layout="row"
                onSelect={onSelectListing}
                onToggleFeatured={handleToggleFeatured}
              />
            ))}
          </ul>
        </div>
      )}

      {statsReady && (
        <div className="stats-strip">
          <button type="button" className="stat-cell stat-cell-link" onClick={onOpenContacts}>
            <span className="stat-num">{allContacts.length}</span>
            <span className="stat-label">Contacts</span>
          </button>
          <div className="stat-cell">
            <span className={`stat-num${overdueCount > 0 ? ' stat-num-alert' : ''}`}>{overdueCount}</span>
            <span className="stat-label">Overdue</span>
          </div>
          <div className="stat-cell">
            <span className="stat-num">{todayCount}</span>
            <span className="stat-label">Due today</span>
          </div>
          <div className="stat-cell">
            <span className="stat-num">{quietContacts.length}</span>
            <span className="stat-label">Quiet 7d+</span>
          </div>
        </div>
      )}

      {statsReady && (
        <div className="performance-section">
          <p className="section-label">Performance</p>
          <div className="trend-widgets">
            <TrendWidget label="New contacts (7d)" value={newContactsWeek} counts={newContactsTrend} />
            <TrendWidget label="Follow-ups due" value={followUps.length} counts={followUpsTrend} />
          </div>
        </div>
      )}

      <RecentActivity session={session} onSelectContact={onSelectContact} />

      {quietContacts && quietContacts.length > 0 && (
        <div className="attention-strip">
          <p className="section-label">Needs attention</p>
          {quietContacts.slice(0, 3).map((c) => {
            const idle = daysSince(c.last_interaction_date || c.created_at)
            return (
              <button type="button" className="attention-entry" key={c.id} onClick={() => onSelectContact(c.id)}>
                <span className="attention-name">{c.name}</span>
                <span className="attention-idle">
                  {idle === null ? 'No contact yet' : `Quiet ${idle} day${idle === 1 ? '' : 's'}`}
                </span>
              </button>
            )
          })}
        </div>
      )}

      <p className="section-label">Upcoming schedule</p>
      {followUps === null ? (
        <p>Loading...</p>
      ) : followUps.length === 0 ? (
        <div className="empty-today">
          <p>Nothing due today. You're all caught up.</p>
          {nextUp && (
            <button type="button" className="next-up-entry" onClick={() => onSelectContact(nextUp.contact_id)}>
              <span className="next-up-label">Next up</span>
              <span className="entry-name">{nextUp.contact_name || 'Unknown contact'}</span>
              <p className="entry-what">{nextUp.description}</p>
              <span className="entry-when">{new Date(nextUp.due_date).toLocaleDateString()}</span>
            </button>
          )}
        </div>
      ) : (
        SECTIONS.map(({ bucket, label, chipLabel }) => {
          const items = followUps.filter((f) => bucketFor(f.due_date) === bucket)
          if (items.length === 0) return null
          return (
            <div key={bucket} className="followup-section">
              <p className="section-label">
                {label} ({items.length})
              </p>
              {items.map((f) => (
                <button
                  type="button"
                  className="followup-entry"
                  key={f.id}
                  onClick={() => onSelectContact(f.contact_id)}
                >
                  <div className="entry-top">
                    <span className="entry-name">{f.contact_name || 'Unknown contact'}</span>
                    <Chip tone={bucket}>{chipLabel}</Chip>
                  </div>
                  <p className="entry-what">{f.description}</p>
                  <span className="entry-when">{whenLabel(f.due_date, bucket)}</span>
                </button>
              ))}
            </div>
          )
        })
      )}

      <button type="button" className="view-ledger-btn" onClick={onOpenFollowUps}>
        View full ledger
      </button>
    </div>
  )
}

export default TodayFollowUps
