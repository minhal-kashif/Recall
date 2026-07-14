import { useEffect, useState } from 'react'

function ContactList({ session, onSelect, onAdd }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [areaOfInterest, setAreaOfInterest] = useState('')
  const [contacts, setContacts] = useState([])
  const [error, setError] = useState(null)

  const apiUrl = import.meta.env.VITE_API_URL
  const authHeaders = { Authorization: `Bearer ${session.access_token}` }

  useEffect(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (type) params.set('type', type)
    if (propertyType) params.set('property_type', propertyType)
    if (areaOfInterest) params.set('area_of_interest', areaOfInterest)

    const timeoutId = setTimeout(() => {
      fetch(`${apiUrl}/api/contacts?${params.toString()}`, { headers: authHeaders })
        .then((res) => res.json())
        .then((data) => (Array.isArray(data) ? setContacts(data) : setError(data.error)))
        .catch((err) => setError(err.message))
    }, 300)

    return () => clearTimeout(timeoutId)
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
          placeholder="Search by name or phone"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          <option value="buyer">Buyer</option>
          <option value="seller">Seller</option>
          <option value="lead">Lead</option>
        </select>
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          <option value="">All property types</option>
          <option value="house">House</option>
          <option value="apartment">Apartment</option>
        </select>
        <input
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
