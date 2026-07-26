import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import ListingCard from './ListingCard'
import './Listings.css'

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

const PROPERTY_TYPE_FILTERS = [
  { value: '', label: 'All property types' },
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'plot', label: 'Plot / Land' },
]

function Listings({ session, onAdd, onSelect }) {
  const [listings, setListings] = useState(null)
  const [propertyType, setPropertyType] = useState('')
  const [error, setError] = useState(null)

  const token = session.access_token

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/api/listings', { token, signal: controller.signal })
      .then((data) => (Array.isArray(data) ? setListings(data) : setError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setError(err.message)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggleFeatured = async (id, nextFeatured) => {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, is_featured: nextFeatured } : l)))
    try {
      await apiFetch(`/api/listings/${id}`, {
        method: 'PATCH',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_featured: nextFeatured }),
      })
    } catch (err) {
      setError(err.message)
      setListings((prev) => prev.map((l) => (l.id === id ? { ...l, is_featured: !nextFeatured } : l)))
    }
  }

  return (
    <div>
      <div className="list-header">
        <h2 className="registry-title">Property Register</h2>
        <button type="button" className="icon-btn-square" onClick={onAdd} aria-label="Add listing">
          <PlusIcon />
        </button>
      </div>

      <div className="list-filters listing-filters">
        <select
          aria-label="Filter by property type"
          value={propertyType}
          onChange={(e) => setPropertyType(e.target.value)}
        >
          {PROPERTY_TYPE_FILTERS.map((p) => (
            <option key={p.value || 'all'} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      {listings === null ? (
        <p>Loading...</p>
      ) : listings.length === 0 ? (
        <p>No listings yet.</p>
      ) : (
        (() => {
          const filtered = propertyType ? listings.filter((l) => l.property_type === propertyType) : listings
          return filtered.length === 0 ? (
            <p>No listings match.</p>
          ) : (
            <ul className="listing-list">
              {filtered.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  layout="row"
                  onSelect={onSelect}
                  onToggleFeatured={handleToggleFeatured}
                />
              ))}
            </ul>
          )
        })()
      )}
    </div>
  )
}

export default Listings
