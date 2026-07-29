import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { uploadVoiceNote } from './voiceNotesApi'
import { useVoiceRecorder } from './useVoiceRecorder'
import VoiceRecorderControl from './VoiceRecorderControl'
import AmountInput from './AmountInput'
import './ContactForm.css'
import './VoiceRecorderControl.css'

const BEDS_OPTIONS = ['Studio', '1', '2', '3', '4+']
const PROPERTY_TYPES = [
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'plot', label: 'Plot / Land' },
]

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

const FOLLOWUP_SEQUENCE_OFFSETS = [1, 3, 7, 14, 21, 30]

function ContactForm({ session, contactId, onSaved, onCancel }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [type, setType] = useState('lead')
  const [notes, setNotes] = useState('')
  const [source, setSource] = useState('')
  const [buyerDetails, setBuyerDetails] = useState(emptyBuyerDetails)
  const [sellerDetails, setSellerDetails] = useState(emptySellerDetails)
  const [loading, setLoading] = useState(Boolean(contactId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [scheduleSequence, setScheduleSequence] = useState(false)
  const [sequenceCount, setSequenceCount] = useState(3)

  const token = session.access_token
  const recorder = useVoiceRecorder()

  useEffect(() => {
    if (!contactId) return

    const controller = new AbortController()
    apiFetch(`/api/contacts/${contactId}`, { token, signal: controller.signal })
      .then((data) => {
        setName(data.name || '')
        setPhone(data.phone || '')
        setType(data.type || 'lead')
        setNotes(data.notes || '')
        setSource(data.source || '')
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

    const payload = { name, phone, type, notes, source: source || null }
    if (type === 'buyer' || type === 'lead' || type === 'tenant') {
      payload.buyer_details = buyerDetails
    } else if (type === 'seller') {
      payload.seller_details = sellerDetails
    }

    const url = contactId ? `/api/contacts/${contactId}` : '/api/contacts'
    const method = contactId ? 'PATCH' : 'POST'

    try {
      const data = await apiFetch(url, { method, token, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })

      // A voice note can only attach to a contact that already exists, so a
      // note recorded while adding a new contact is held in memory until
      // right after this create succeeds — same one-step feel, deferred
      // under the hood. The contact itself is already saved at this point,
      // so a failure here shouldn't block navigation — just warn.
      const warnings = []
      if (!contactId && recorder.preview) {
        try {
          await uploadVoiceNote({
            contactId: data.id,
            blob: recorder.preview.blob,
            durationSeconds: recorder.preview.durationSeconds,
            token,
          })
        } catch {
          warnings.push('the voice note failed to attach — you can record it again from the contact page')
        }
      }

      if (!contactId && scheduleSequence) {
        const offsets = FOLLOWUP_SEQUENCE_OFFSETS.slice(0, sequenceCount)
        try {
          for (let i = 0; i < offsets.length; i += 1) {
            const dueDate = new Date(Date.now() + offsets[i] * 24 * 60 * 60 * 1000)
            // eslint-disable-next-line no-await-in-loop
            await apiFetch('/api/follow-ups', {
              method: 'POST',
              token,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contact_id: data.id,
                description: `Follow up #${i + 1}`,
                due_date: dueDate.toISOString(),
              }),
            })
          }
        } catch {
          warnings.push('the follow-up sequence only partly saved — check the contact’s follow-ups')
        }
      }

      onSaved(data, warnings.length ? `Contact saved, but ${warnings.join('; and ')}.` : null)
    } catch (err) {
      setError(err.message)
      setSubmitting(false)
    }
  }

  if (loading) return <p>Loading contact...</p>

  return (
    <form onSubmit={handleSubmit}>
      <h2 className="registry-title form-title">{contactId ? 'Edit contact' : 'Add contact'}</h2>
      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

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
          <option value="tenant">Tenant</option>
          <option value="seller">Seller</option>
        </select>
      </label>

      <label>
        How did they reach you?
        <select value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">--</option>
          <option value="call">Call</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </label>

      <label>
        Notes
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {!contactId && (
        <div className="voice-note-field">
          <label className="sequence-toggle">
            <input
              type="checkbox"
              checked={scheduleSequence}
              onChange={(e) => setScheduleSequence(e.target.checked)}
            />{' '}
            Schedule a follow-up sequence
          </label>
          {scheduleSequence && (
            <label>
              Number of follow-ups
              <select value={sequenceCount} onChange={(e) => setSequenceCount(Number(e.target.value))}>
                {FOLLOWUP_SEQUENCE_OFFSETS.map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
              <p className="voice-note-hint">
                Creates {sequenceCount} follow-up{sequenceCount === 1 ? '' : 's'} at day{' '}
                {FOLLOWUP_SEQUENCE_OFFSETS.slice(0, sequenceCount).join(', ')} from today.
              </p>
            </label>
          )}
        </div>
      )}

      {!contactId && (
        <div className="voice-note-field">
          <p className="section-label">Voice note (optional)</p>
          <VoiceRecorderControl recorder={recorder} hint="Will be attached when you save this contact." />
        </div>
      )}

      {(type === 'buyer' || type === 'lead' || type === 'tenant') && (
        <fieldset>
          <legend>What they're looking for</legend>
          <label>
            Budget
            <AmountInput
              label="Budget"
              value={buyerDetails.budget}
              onChange={(v) => setBuyerDetails({ ...buyerDetails, budget: v })}
            />
          </label>
          {buyerDetails.property_type_wanted !== 'plot' && (
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
          )}
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
              onChange={(e) =>
                setBuyerDetails({
                  ...buyerDetails,
                  property_type_wanted: e.target.value,
                  beds_wanted: e.target.value === 'plot' ? '' : buyerDetails.beds_wanted,
                })
              }
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
            <AmountInput
              label="Asking price"
              value={sellerDetails.asking_price}
              onChange={(v) => setSellerDetails({ ...sellerDetails, asking_price: v })}
            />
          </label>
          {sellerDetails.property_type !== 'plot' && (
            <label>
              Beds
              <input
                value={sellerDetails.beds}
                onChange={(e) => setSellerDetails({ ...sellerDetails, beds: e.target.value })}
              />
            </label>
          )}
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
              onChange={(e) =>
                setSellerDetails({
                  ...sellerDetails,
                  property_type: e.target.value,
                  beds: e.target.value === 'plot' ? '' : sellerDetails.beds,
                })
              }
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
            Condition / notes on unit
            <textarea
              value={sellerDetails.condition_notes}
              onChange={(e) => setSellerDetails({ ...sellerDetails, condition_notes: e.target.value })}
            />
          </label>
        </fieldset>
      )}

      <div className="form-actions">
        <button type="submit" disabled={submitting || recorder.recording}>
          {submitting ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
      </div>
      {recorder.recording && <p className="field-warning">Stop the recording before saving.</p>}
    </form>
  )
}

export default ContactForm
