import { useEffect, useState } from 'react'
import { apiFetch } from './api'

function ContactList({ session, onSelect, onAdd }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [areaOfInterest, setAreaOfInterest] = useState('')
  const [contacts, setContacts] = useState([])
  const [error, setError] = useState(null)

  const token = session.access_token

  useEffect(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (type) params.set('type', type)
    if (propertyType) params.set('property_type', propertyType)
    if (areaOfInterest) params.set('area_of_interest', areaOfInterest)

    // AbortController, not just the debounce timer, matters here: the timer
    // only stops a fetch that hasn't started yet. Once in flight, an older
    // request can still resolve after a newer one and silently overwrite the
    // list with stale results — clearTimeout alone doesn't prevent that.
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      apiFetch(`/api/contacts?${params.toString()}`, { token, signal: controller.signal })
        .then((data) => (Array.isArray(data) ? setContacts(data) : setError(data.error)))
        .catch((err) => {
          if (err.message !== 'cancelled') setError(err.message)
        })
    }, 300)

    return () => {
      clearTimeout(timeoutId)
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, type, propertyType, areaOfInterest])

  return (
    <div>
      <h2>Contacts</h2>
      <button type="button" onClick={onAdd}>
        + Add Contact
      </button>

      <div>
        <input
          type="search"
          aria-label="Search by name or phone"
          placeholder="Search by name or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select aria-label="Filter by type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
          <option value="lead">Lead</option>
          <option value="tenant">Tenant</option>
        </select>
        <select
          aria-label="Filter by property type"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
        >
          <option value="">All property types</option>
          <option value="house">House</option>
          <option value="apartment">Apartment</option>
        </select>
        <input
          aria-label="Filter by area of interest"
          placeholder="Area of interest"
          value={areaOfInterest}
          onChange={(e) => setAreaOfInterest(e.target.value)}
        />
      </div>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {contacts.length === 0 ? (
        <p>No contacts match.</p>
      ) : (
        <ul>
          {contacts.map((c) => (
            <li key={c.id}>
              <button type="button" onClick={() => onSelect(c.id)}>
                {c.name} — {c.type} — {c.phone}
                {c.property_type ? ` — ${c.property_type}` : ''}
                {c.area_of_interest ? ` — ${c.area_of_interest}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ContactList
