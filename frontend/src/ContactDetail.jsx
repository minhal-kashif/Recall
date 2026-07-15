import { useEffect, useState } from 'react'
import FollowUpList from './FollowUpList'
import { apiFetch } from './api'

function ContactDetail({ session, contactId, onEdit, onBack }) {
  const [contact, setContact] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [noteText, setNoteText] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

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

  const loadInteractions = (signal) => {
    apiFetch(`/api/interactions/${contactId}`, { token, signal })
      .then(setInteractions)
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadContact(controller.signal)
    loadInteractions(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

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
      loadInteractions()
      loadContact() // last_interaction_date changed
      setSubmitting(false)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (!contact) {
    return error ? <p style={{ color: 'red' }}>{error}</p> : <p>Loading...</p>
  }

  const details = contact.details || {}

  return (
    <div>
      <button type="button" onClick={onBack}>
        ← Back
      </button>
      <button type="button" onClick={() => onEdit(contactId)}>
        Edit
      </button>

      <h2>{contact.name}</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <section>
        <h3>Contact info</h3>
        <p>Phone: {contact.phone}</p>
        <p>Type: {contact.type}</p>
        <p>Notes: {contact.notes || '—'}</p>
        <p>Last interaction: {contact.last_interaction_date ? new Date(contact.last_interaction_date).toLocaleString() : 'Never'}</p>
      </section>

      {(contact.type === 'buyer' || contact.type === 'lead') && (
        <section>
          <h3>What they're looking for</h3>
          <p>Budget: {details.budget ?? '—'}</p>
          <p>Beds wanted: {details.beds_wanted || '—'}</p>
          <p>Size wanted (sq. yd): {details.size_wanted_sqyd ?? '—'}</p>
          <p>Property type wanted: {details.property_type_wanted || '—'}</p>
          <p>Area of interest: {details.area_of_interest || '—'}</p>
        </section>
      )}

      {contact.type === 'seller' && (
        <section>
          <h3>What they're offering</h3>
          <p>Property address: {details.property_address || '—'}</p>
          <p>Asking price: {details.asking_price ?? '—'}</p>
          <p>Beds: {details.beds || '—'}</p>
          <p>Size (sq. yd): {details.size_sqyd ?? '—'}</p>
          <p>Property type: {details.property_type || '—'}</p>
          <p>Condition notes: {details.condition_notes || '—'}</p>
        </section>
      )}

      <FollowUpList session={session} contactId={contactId} />

      <section>
        <h3>Add a note</h3>
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

      <section>
        <h3>Interaction history</h3>
        {interactions.length === 0 ? (
          <p>No interactions logged yet.</p>
        ) : (
          <ul>
            {interactions.map((i) => (
              <li key={i.id}>
                <strong>{new Date(i.interaction_date).toLocaleString()}</strong> ({i.source}): {i.note_text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default ContactDetail
