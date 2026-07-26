import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { uploadListingPhoto } from './listingsApi'
import AmountInput from './AmountInput'
import './ListingForm.css'

const PROPERTY_TYPES = [
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'plot', label: 'Plot / Land' },
]
const STATUS_OPTIONS = [
  { value: 'available', label: 'Available' },
  { value: 'under_offer', label: 'Under offer' },
  { value: 'sold', label: 'Sold' },
  { value: 'rented', label: 'Rented' },
]

function ListingForm({ session, listingId, onSaved, onCancel }) {
  const [propertyAddress, setPropertyAddress] = useState('')
  const [askingPrice, setAskingPrice] = useState('')
  const [beds, setBeds] = useState('')
  const [sizeSqyd, setSizeSqyd] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [conditionNotes, setConditionNotes] = useState('')
  const [contactId, setContactId] = useState('')
  const [status, setStatus] = useState('available')
  const [sellerContacts, setSellerContacts] = useState([])
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(null)
  const [existingPhotoUrl, setExistingPhotoUrl] = useState(null)
  const [loading, setLoading] = useState(Boolean(listingId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const token = session.access_token

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/contacts?type=seller', { token, signal: controller.signal })
      .then((data) => {
        if (Array.isArray(data)) setSellerContacts(data)
      })
      .catch(() => {})
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!listingId) return
    const controller = new AbortController()
    apiFetch(`/api/listings/${listingId}`, { token, signal: controller.signal })
      .then((data) => {
        setPropertyAddress(data.property_address || '')
        setAskingPrice(data.asking_price ?? '')
        setBeds(data.beds || '')
        setSizeSqyd(data.size_sqyd ?? '')
        setPropertyType(data.property_type || '')
        setConditionNotes(data.condition_notes || '')
        setContactId(data.contact_id || '')
        setStatus(data.status || 'available')
        setExistingPhotoUrl(data.photo_url || null)
        setLoading(false)
      })
      .catch((err) => {
        if (err.message === 'cancelled') return
        setError(err.message)
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingId])

  const handlePhotoChange = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreviewUrl(URL.createObjectURL(file))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const payload = {
      property_address: propertyAddress,
      asking_price: askingPrice === '' ? null : askingPrice,
      beds: beds || null,
      size_sqyd: sizeSqyd === '' ? null : sizeSqyd,
      property_type: propertyType || null,
      condition_notes: conditionNotes || null,
      contact_id: contactId || null,
      status,
    }

    const url = listingId ? `/api/listings/${listingId}` : '/api/listings'
    const method = listingId ? 'PATCH' : 'POST'

    try {
      const data = await apiFetch(url, {
        method,
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      // Same deferred-attach pattern as a voice note on a new contact — the
      // listing itself is already saved, so a photo failure shouldn't block
      // navigation, just warn.
      let warning = null
      if (photoFile) {
        try {
          await uploadListingPhoto({ listingId: data.id, file: photoFile, token })
        } catch {
          warning = 'the photo failed to upload — you can add it again from the listing page'
        }
      }

      onSaved(data, warning)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return <p>Loading listing...</p>

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="registry-title form-title">{listingId ? 'Edit listing' : 'Add listing'}</h2>
      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      <label>
        Property address / project name
        <input value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} required />
      </label>

      <label>
        Asking price
        <AmountInput label="Asking price" value={askingPrice} onChange={setAskingPrice} />
      </label>

      {propertyType !== 'plot' && (
        <label>
          Beds
          <input value={beds} onChange={(e) => setBeds(e.target.value)} />
        </label>
      )}

      <label>
        Size (sq. yd)
        <input type="number" value={sizeSqyd} onChange={(e) => setSizeSqyd(e.target.value)} />
      </label>

      <label>
        Property type
        <select
          value={propertyType}
          onChange={(e) => {
            setPropertyType(e.target.value)
            if (e.target.value === 'plot') setBeds('')
          }}
        >
          <option value="">--</option>
          {PROPERTY_TYPES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        Condition / notes on unit
        <textarea value={conditionNotes} onChange={(e) => setConditionNotes(e.target.value)} />
      </label>

      <label>
        Belongs to (optional)
        <select value={contactId} onChange={(e) => setContactId(e.target.value)}>
          <option value="">-- Not linked to a contact --</option>
          {sellerContacts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <div className="listing-photo-field">
        <p className="section-label">Cover photo</p>
        {(photoPreviewUrl || existingPhotoUrl) && (
          <div className="listing-photo-preview">
            <img src={photoPreviewUrl || existingPhotoUrl} alt="" />
          </div>
        )}
        <input type="file" accept="image/*" onChange={handlePhotoChange} />
      </div>

      <div className="form-actions">
        <button type="submit" disabled={submitting}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default ListingForm
