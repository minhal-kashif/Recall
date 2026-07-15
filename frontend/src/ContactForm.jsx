import { useEffect, useState } from 'react'
import { apiFetch } from './api'

const BEDS_OPTIONS = ['Studio', '1', '2', '3', '4+']
const PROPERTY_TYPES = ['house', 'apartment']

const emptyBuyerDetails = {
  budget: '',
  beds_wanted: '',
  size_wanted_sqyd: '',
  property_type_wanted: '',
  area_of_interest: '',
}

const emptySellerDetails = {
  property_address: '',
  asking_price: '',
  beds: '',
  size_sqyd: '',
  property_type: '',
  condition_notes: '',
}

// The API returns explicit `null` for unset optional fields; controlled inputs
// need '' instead, or React logs a value-prop warning and the field goes uncontrolled.
function nullsToEmptyStrings(obj) {
  return Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, value === null ? '' : value]))
}

function ContactForm({ session, contactId, onSaved, onCancel }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState('lead')
  const [notes, setNotes] = useState('')
  const [buyerDetails, setBuyerDetails] = useState(emptyBuyerDetails)
  const [sellerDetails, setSellerDetails] = useState(emptySellerDetails)
  const [loading, setLoading] = useState(Boolean(contactId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  const token = session.access_token

  useEffect(() => {
    if (!contactId) return

    const controller = new AbortController()
    apiFetch(`/api/contacts/${contactId}`, { token, signal: controller.signal })
      .then((data) => {
        setName(data.name || '')
        setPhone(data.phone || '')
        setType(data.type || 'lead')
        setNotes(data.notes || '')
        if (data.type === 'seller') {
          setSellerDetails({ ...emptySellerDetails, ...nullsToEmptyStrings(data.details || {}) })
        } else {
          setBuyerDetails({ ...emptyBuyerDetails, ...nullsToEmptyStrings(data.details || {}) })
        }
        setLoading(false)
      })
      .catch((err) => {
        if (err.message === 'cancelled') return
        setError(err.message)
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)

    const payload = { name, phone, type, notes }
    if (type === 'buyer' || type === 'lead') {
      payload.buyer_details = buyerDetails
    } else if (type === 'seller') {
      payload.seller_details = sellerDetails
    }

    const url = contactId ? `/api/contacts/${contactId}` : '/api/contacts'
    const method = contactId ? 'PATCH' : 'POST'

    try {
      const data = await apiFetch(url, { method, token, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      onSaved(data)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return <p>Loading contact...</p>

  return (
    <form onSubmit={handleSubmit}>
      <h2>{contactId ? 'Edit Contact' : 'Add Contact'}</h2>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>

      <label>
        Phone
        <input value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </label>

      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="lead">Lead</option>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
        </select>
      </label>

      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {(type === 'buyer' || type === 'lead') && (
        <fieldset>
          <legend>What they're looking for</legend>
          <label>
            Budget
            <input
              type="number"
              value={buyerDetails.budget}
              onChange={(e) => setBuyerDetails({ ...buyerDetails, budget: e.target.value })}
            />
          </label>
          <label>
            Beds wanted
            <select
              value={buyerDetails.beds_wanted}
              onChange={(e) => setBuyerDetails({ ...buyerDetails, beds_wanted: e.target.value })}
            >
              <option value="">--</option>
              {BEDS_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
          <label>
            Size wanted (sq. yd)
            <input
              type="number"
              value={buyerDetails.size_wanted_sqyd}
              onChange={(e) => setBuyerDetails({ ...buyerDetails, size_wanted_sqyd: e.target.value })}
            />
          </label>
          <label>
            Property type wanted
            <select
              value={buyerDetails.property_type_wanted}
              onChange={(e) => setBuyerDetails({ ...buyerDetails, property_type_wanted: e.target.value })}
            >
              <option value="">--</option>
              {PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Area of interest
            <input
              value={buyerDetails.area_of_interest}
              onChange={(e) => setBuyerDetails({ ...buyerDetails, area_of_interest: e.target.value })}
            />
          </label>
        </fieldset>
      )}

      {type === 'seller' && (
        <fieldset>
          <legend>What they're offering</legend>
          <label>
            Property address / project name
            <input
              value={sellerDetails.property_address}
              onChange={(e) => setSellerDetails({ ...sellerDetails, property_address: e.target.value })}
            />
          </label>
          <label>
            Asking price
            <input
              type="number"
              value={sellerDetails.asking_price}
              onChange={(e) => setSellerDetails({ ...sellerDetails, asking_price: e.target.value })}
            />
          </label>
          <label>
            Beds
            <input
              value={sellerDetails.beds}
              onChange={(e) => setSellerDetails({ ...sellerDetails, beds: e.target.value })}
            />
          </label>
          <label>
            Size (sq. yd)
            <input
              type="number"
              value={sellerDetails.size_sqyd}
              onChange={(e) => setSellerDetails({ ...sellerDetails, size_sqyd: e.target.value })}
            />
          </label>
          <label>
            Property type
            <select
              value={sellerDetails.property_type}
              onChange={(e) => setSellerDetails({ ...sellerDetails, property_type: e.target.value })}
            >
              <option value="">--</option>
              {PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            Condition / notes on unit
            <textarea
              value={sellerDetails.condition_notes}
              onChange={(e) => setSellerDetails({ ...sellerDetails, condition_notes: e.target.value })}
            />
          </label>
        </fieldset>
      )}

      <div>
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

export default ContactForm
