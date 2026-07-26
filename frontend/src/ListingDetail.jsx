import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { formatAmount } from './formatAmount'
import Chip from './Chip'
import './ListingDetail.css'

const STATUS_LABELS = {
  available: 'Available',
  under_offer: 'Under offer',
  sold: 'Sold',
  rented: 'Rented',
}

function ListingDetail({ session, listingId, onEdit, onBack, onDeleted, onSelectContact }) {
  const [listing, setListing] = useState(null)
  const [error, setError] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [interests, setInterests] = useState(null)
  const [candidateContacts, setCandidateContacts] = useState([])
  const [pickedContactId, setPickedContactId] = useState('')
  const [addingInterest, setAddingInterest] = useState(false)

  const token = session.access_token

  useEffect(() => {
    const controller = new AbortController()
    apiFetch(`/api/listings/${listingId}`, { token, signal: controller.signal })
      .then(setListing)
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    apiFetch(`/api/listings/${listingId}/interests`, { token, signal: controller.signal })
      .then((data) => (Array.isArray(data) ? setInterests(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    apiFetch('/api/contacts', { token, signal: controller.signal })
      .then((data) => {
        if (Array.isArray(data)) setCandidateContacts(data.filter((c) => c.type !== 'seller'))
      })
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      await apiFetch(`/api/listings/${listingId}`, { token, method: 'DELETE' })
      onDeleted()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  const handleAddInterest = async (event) => {
    event.preventDefault()
    if (!pickedContactId) return
    setAddingInterest(true)
    setError(null)
    try {
      const created = await apiFetch(`/api/listings/${listingId}/interests`, {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: pickedContactId }),
      })
      setInterests((prev) => [created, ...(prev || [])])
      setPickedContactId('')
    } catch (err) {
      setError(err.message)
    } finally {
      setAddingInterest(false)
    }
  }

  const handleRemoveInterest = async (interestId) => {
    setError(null)
    try {
      await apiFetch(`/api/listings/${listingId}/interests/${interestId}`, { token, method: 'DELETE' })
      setInterests((prev) => prev.filter((i) => i.id !== interestId))
    } catch (err) {
      setError(err.message)
    }
  }

  if (!listing) {
    return error ? <p style={{ color: 'var(--brick-text)' }}>{error}</p> : <p>Loading...</p>
  }

  const interestedIds = new Set((interests || []).map((i) => i.contact_id))
  const pickableContacts = candidateContacts.filter((c) => !interestedIds.has(c.id))

  return (
    <div>
      <div className="detail-nav">
        <button type="button" onClick={onBack}>
          ← Back
        </button>
        <button type="button" onClick={() => onEdit(listingId)}>
          Edit
        </button>
        {confirmingDelete ? (
          <span className="delete-confirm">
            Delete this listing?{' '}
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

      <div className="listing-photo-full">
        {listing.photo_url ? (
          <img src={listing.photo_url} alt="" />
        ) : (
          <div className="listing-photo-placeholder">No photo</div>
        )}
      </div>

      <div className="listing-detail-title-row">
        <span className="nameplate-name">{listing.property_address}</span>
        {listing.status && <Chip tone={listing.status}>{STATUS_LABELS[listing.status] || listing.status}</Chip>}
      </div>

      {listing.contact_id && (
        <button type="button" className="listing-linked-contact" onClick={() => onSelectContact(listing.contact_id)}>
          Belongs to {listing.contact_name || 'a contact'} →
        </button>
      )}

      <div className="kv">
        <span className="kv-label">Asking price</span>
        <span className="kv-value">{formatAmount(listing.asking_price)}</span>
      </div>
      <div className="kv">
        <span className="kv-label">Beds</span>
        <span className="kv-value">{listing.beds || '—'}</span>
      </div>
      <div className="kv">
        <span className="kv-label">Size (sq. yd)</span>
        <span className="kv-value">{listing.size_sqyd ?? '—'}</span>
      </div>
      <div className="kv">
        <span className="kv-label">Property type</span>
        <span className="kv-value">{listing.property_type || '—'}</span>
      </div>
      <div className="kv">
        <span className="kv-label">Condition notes</span>
        <span className="kv-value">{listing.condition_notes || '—'}</span>
      </div>

      <p className="section-label">
        Interested leads {interests ? `(${interests.length})` : ''}
      </p>

      {pickableContacts.length > 0 && (
        <form className="add-interest-form" onSubmit={handleAddInterest}>
          <select
            aria-label="Pick a contact to mark interested"
            value={pickedContactId}
            onChange={(e) => setPickedContactId(e.target.value)}
          >
            <option value="">-- Pick a lead --</option>
            {pickableContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.type})
              </option>
            ))}
          </select>
          <button type="submit" disabled={!pickedContactId || addingInterest}>
            {addingInterest ? 'Adding...' : '+ Add'}
          </button>
        </form>
      )}

      {interests === null ? (
        <p>Loading...</p>
      ) : interests.length === 0 ? (
        <p>No interested leads yet.</p>
      ) : (
        <ul>
          {interests.map((i) => (
            <li key={i.id} className="interest-row">
              <button type="button" className="interest-name" onClick={() => onSelectContact(i.contact_id)}>
                {i.contact_name || 'Unknown contact'}
              </button>
              <button
                type="button"
                className="interest-remove"
                aria-label={`Remove ${i.contact_name || 'contact'} from interested leads`}
                onClick={() => handleRemoveInterest(i.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ListingDetail
