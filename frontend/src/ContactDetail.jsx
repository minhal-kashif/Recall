import { useEffect, useState } from 'react'
import FollowUpList from './FollowUpList'
import VoiceNotes from './VoiceNotes'
import ActivityTimeline from './ActivityTimeline'
import LogCallModal from './LogCallModal'
import Chip from './Chip'
import { apiFetch } from './api'
import { telLink, whatsappLink } from './phoneLinks'
import { startPendingLog } from './pendingLog'
import { formatAmount } from './formatAmount'
import './ContactDetail.css'

function ContactDetail({ session, contactId, onEdit, onBack, onDeleted }) {
  const [contact, setContact] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [activityRefreshKey, setActivityRefreshKey] = useState(0)
  const [showLogCall, setShowLogCall] = useState(false)

  const token = session.access_token

  // Optional signal: passed by the mount/contactId-change effect below so a
  // superseded request (e.g. rapidly switching contacts) can't resolve after
  // a newer one and overwrite state with stale data; plain manual reloads
  // (e.g. after adding a note) don't need it since there's nothing to race.
  const loadContact = (signal) => {
    apiFetch(`/api/contacts/${contactId}`, { token, signal })
      .then(setContact)
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadContact(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  const refreshActivity = () => setActivityRefreshKey((k) => k + 1)

  const handleAddNote = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      await apiFetch('/api/interactions', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, note_text: noteText }),
      })
      setNoteText('')
      refreshActivity()
      loadContact() // last_interaction_date changed
      setSubmitting(false)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await apiFetch(`/api/contacts/${contactId}`, { token, method: 'DELETE' })
      onDeleted()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  if (!contact) {
    return error ? <p style={{ color: 'var(--brick-text)' }}>{error}</p> : <p>Loading...</p>
  }

  const details = contact.details || {}

  return (
    <div>
      <div className="detail-nav">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <button type="button" onClick={() => onEdit(contactId)}>
          Edit
        </button>
        {confirmingDelete ? (
          <span className="delete-confirm">
            Delete {contact.name}?{' '}
            <button type="button" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Confirm'}
            </button>{' '}
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmingDelete(true)}>
            Delete
          </button>
        )}
      </div>

      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      <div className="nameplate">
        <span className="nameplate-name">{contact.name}</span>
        <div className="nameplate-meta">
          <span className="nameplate-phone">{contact.phone}</span>
          <Chip tone={contact.type}>{contact.type}</Chip>
        </div>
        <div className="nameplate-actions">
          <a
            className="contact-action contact-action-call"
            href={telLink(contact.phone)}
            onClick={() => startPendingLog({ contactId, contactName: contact.name, source: 'call' })}
          >
            Call
          </a>
          <a
            className="contact-action contact-action-whatsapp"
            href={whatsappLink(contact.phone)}
            target="_blank"
            rel="noreferrer"
            onClick={() => startPendingLog({ contactId, contactName: contact.name, source: 'whatsapp' })}
          >
            WhatsApp
          </a>
          <button type="button" className="contact-action contact-action-log" onClick={() => setShowLogCall(true)}>
            Log a call
          </button>
        </div>
        <p className="nameplate-notes">{contact.notes || 'No notes yet.'}</p>
        <p className="nameplate-last">
          Last interaction:{' '}
          {contact.last_interaction_date ? new Date(contact.last_interaction_date).toLocaleDateString() : 'Never'}
        </p>
        {contact.source && (
          <p className="nameplate-last">Reached via: {contact.source === 'whatsapp' ? 'WhatsApp' : 'Call'}</p>
        )}
      </div>

      {(contact.type === 'buyer' || contact.type === 'lead' || contact.type === 'tenant') && (
        <section>
          <p className="section-label">What they're looking for</p>
          <div className="kv">
            <span className="kv-label">Budget</span>
            <span className="kv-value">{formatAmount(details.budget)}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Beds wanted</span>
            <span className="kv-value">{details.beds_wanted || '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Size wanted (sq. yd)</span>
            <span className="kv-value">{details.size_wanted_sqyd ?? '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Property type wanted</span>
            <span className="kv-value">{details.property_type_wanted || '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Area of interest</span>
            <span className="kv-value">{details.area_of_interest || '—'}</span>
          </div>
        </section>
      )}

      {contact.type === 'seller' && (
        <section>
          <p className="section-label">What they're offering</p>
          <div className="kv">
            <span className="kv-label">Property address</span>
            <span className="kv-value">{details.property_address || '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Asking price</span>
            <span className="kv-value">{formatAmount(details.asking_price)}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Beds</span>
            <span className="kv-value">{details.beds || '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Size (sq. yd)</span>
            <span className="kv-value">{details.size_sqyd ?? '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Property type</span>
            <span className="kv-value">{details.property_type || '—'}</span>
          </div>
          <div className="kv">
            <span className="kv-label">Condition notes</span>
            <span className="kv-value">{details.condition_notes || '—'}</span>
          </div>
        </section>
      )}

      <FollowUpList session={session} contactId={contactId} onChange={refreshActivity} />

      <VoiceNotes
        session={session}
        contactId={contactId}
        onUploaded={() => {
          refreshActivity()
          loadContact()
        }}
      />

      <section>
        <p className="section-label">Add a note</p>
        <form onSubmit={handleAddNote}>
          <textarea
            aria-label="What was discussed?"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="What was discussed?"
            required
          />
          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Add note'}
          </button>
        </form>
      </section>

      <ActivityTimeline session={session} contactId={contactId} refreshKey={activityRefreshKey} />

      {showLogCall && (
        <LogCallModal
          session={session}
          contactId={contactId}
          contactName={contact.name}
          onClose={() => setShowLogCall(false)}
          onLogged={() => {
            refreshActivity()
            loadContact()
          }}
        />
      )}
    </div>
  )
}

export default ContactDetail
