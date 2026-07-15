import { useEffect, useState } from 'react'
import FollowUpList from './FollowUpList'

function ContactDetail({ session, contactId, onEdit, onBack }) {
  const [contact, setContact] = useState(null)
  const [interactions, setInteractions] = useState([])
  const [noteText, setNoteText] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const apiUrl = import.meta.env.VITE_API_URL
  const authHeaders = { Authorization: `Bearer ${session.access_token}` }

  const loadContact = () => {
    fetch(`${apiUrl}/api/contacts/${contactId}`, { headers: authHeaders })
      .then((res) => res.json())
      .then(setContact)
      .catch((err) => setError(err.message))
  }

  const loadInteractions = () => {
    fetch(`${apiUrl}/api/interactions/${contactId}`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setInteractions(data) : setError(data.error)))
      .catch((err) => setError(err.message))
  }

  useEffect(() => {
    loadContact()
    loadInteractions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  const handleAddNote = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch(`${apiUrl}/api/interactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ contact_id: contactId, note_text: noteText }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError((data.errors && data.errors.join(', ')) || data.error || 'Something went wrong')
        setSubmitting(false)
        return
      }
      setNoteText('')
      loadInteractions()
      loadContact() // last_interaction_date changed
      setSubmitting(false)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (!contact) return <p>Loading...</p>

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
