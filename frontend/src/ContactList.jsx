import { useEffect, useState } from 'react'
import { apiFetch } from './api'
import { telLink, whatsappLink } from './phoneLinks'
import { startPendingLog } from './pendingLog'
import Chip from './Chip'
import './ContactList.css'

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'lead', label: 'Lead' },
  { value: 'tenant', label: 'Tenant' },
]

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 4h18l-7 8v6l-4 2v-8z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function CallIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.61 21 3 13.39 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z"
      />
    </svg>
  )
}

function WhatsAppIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2a10 10 0 0 0-8.6 15.06L2 22l5.06-1.36A10 10 0 1 0 12 2zm0 18.2a8.16 8.16 0 0 1-4.17-1.14l-.3-.18-3.1.84.83-3.02-.2-.31A8.2 8.2 0 1 1 12 20.2zm4.5-6.14c-.24-.12-1.44-.71-1.66-.79s-.38-.12-.55.12-.63.79-.78.95-.28.18-.53.06a6.7 6.7 0 0 1-1.97-1.22 7.4 7.4 0 0 1-1.36-1.7c-.14-.24 0-.37.11-.49.11-.11.24-.28.36-.42a1.6 1.6 0 0 0 .24-.4.44.44 0 0 0-.02-.42c-.06-.12-.55-1.33-.76-1.82s-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.75 2.75 0 0 0-.86 2.05 4.8 4.8 0 0 0 1 2.53 10.9 10.9 0 0 0 4.2 3.72c.59.25 1.04.4 1.4.52a3.37 3.37 0 0 0 1.55.1 2.54 2.54 0 0 0 1.66-1.17 2.06 2.06 0 0 0 .14-1.17c-.06-.1-.22-.16-.46-.28z"
      />
    </svg>
  )
}

function lastInteractionLabel(dateString) {
  if (!dateString) return 'Never'
  return new Date(dateString).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function ContactList({ session, onSelect, onAdd }) {
  const [q, setQ] = useState('')
  const [type, setType] = useState('')
  const [propertyType, setPropertyType] = useState('')
  const [areaOfInterest, setAreaOfInterest] = useState('')
  const [staleDays, setStaleDays] = useState('')
  const [contacts, setContacts] = useState([])
  const [error, setError] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const [savedFilters, setSavedFilters] = useState([])
  const [savedFiltersError, setSavedFiltersError] = useState(null)
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  const token = session.access_token

  const loadSavedFilters = (signal) => {
    apiFetch('/api/saved-filters', { token, signal })
      .then((data) => (Array.isArray(data) ? setSavedFilters(data) : setSavedFiltersError(data.error)))
      .catch((err) => {
        if (err.message !== 'cancelled') setSavedFiltersError(err.message)
      })
  }

  useEffect(() => {
    const controller = new AbortController()
    loadSavedFilters(controller.signal)
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (type) params.set('type', type)
    if (propertyType) params.set('property_type', propertyType)
    if (areaOfInterest) params.set('area_of_interest', areaOfInterest)
    if (staleDays) params.set('stale_days', staleDays)

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
  }, [q, type, propertyType, areaOfInterest, staleDays])

  const hasActiveFilters = Boolean(q || type || propertyType || areaOfInterest || staleDays)

  const applySavedFilter = (sf) => {
    setQ(sf.q || '')
    setType(sf.type || '')
    setPropertyType(sf.property_type || '')
    setAreaOfInterest(sf.area_of_interest || '')
    setStaleDays(sf.stale_days ? String(sf.stale_days) : '')
  }

  const handleSaveFilter = async (event) => {
    event.preventDefault()
    if (!saveName.trim()) return
    setSaving(true)
    setSavedFiltersError(null)
    try {
      const created = await apiFetch('/api/saved-filters', {
        method: 'POST',
        token,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveName.trim(),
          q: q || null,
          type: type || null,
          property_type: propertyType || null,
          area_of_interest: areaOfInterest || null,
          stale_days: staleDays || null,
        }),
      })
      setSavedFilters([...savedFilters, created])
      setShowSaveInput(false)
      setSaveName('')
    } catch (err) {
      setSavedFiltersError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSavedFilter = async (id) => {
    setSavedFiltersError(null)
    try {
      await apiFetch(`/api/saved-filters/${id}`, { method: 'DELETE', token })
      setSavedFilters(savedFilters.filter((sf) => sf.id !== id))
    } catch (err) {
      setSavedFiltersError(err.message)
    }
  }

  return (
    <div>
      <div className="list-header">
        <h2 className="registry-title">Leads Registry</h2>
        <button type="button" className="icon-btn-square" onClick={onAdd} aria-label="Add contact">
          <PlusIcon />
        </button>
      </div>

      <div className="registry-search-row">
        <input
          type="search"
          className="list-search"
          aria-label="Search by name or phone"
          placeholder="Search entries..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="button"
          className={`icon-btn-square${showFilters ? ' active' : ''}`}
          onClick={() => setShowFilters((s) => !s)}
          aria-pressed={showFilters}
          aria-label="Toggle filters"
        >
          <FilterIcon />
        </button>
      </div>

      <div className="pipe-tabs" role="group" aria-label="Filter by type">
        {TYPE_FILTERS.map((t, i) => (
          <span key={t.value || 'all'} style={{ display: 'contents' }}>
            {i > 0 && <span className="pipe-tab-sep">|</span>}
            <button
              type="button"
              className={`pipe-tab${type === t.value ? ' active' : ''}`}
              aria-pressed={type === t.value}
              onClick={() => setType(t.value)}
            >
              {t.label}
            </button>
          </span>
        ))}
      </div>

      {showFilters && (
        <div className="registry-filters">
          {savedFiltersError && <p style={{ color: 'var(--brick-text)' }}>{savedFiltersError}</p>}

          {savedFilters.length > 0 && (
            <div className="smart-list-pills" role="group" aria-label="Saved searches">
              {savedFilters.map((sf) => (
                <span key={sf.id} className="smart-list-pill">
                  <button type="button" onClick={() => applySavedFilter(sf)}>
                    {sf.name}
                  </button>
                  <button
                    type="button"
                    className="smart-list-remove"
                    aria-label={`Delete saved search ${sf.name}`}
                    onClick={() => handleDeleteSavedFilter(sf.id)}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="list-filters">
            <select
              aria-label="Filter by property type"
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
            >
              <option value="">All property types</option>
              <option value="house">House</option>
              <option value="apartment">Apartment</option>
              <option value="plot">Plot / Land</option>
            </select>
            <select
              aria-label="Filter by days since last contact"
              value={staleDays}
              onChange={(e) => setStaleDays(e.target.value)}
            >
              <option value="">Any time</option>
              <option value="7">Quiet 7+ days</option>
              <option value="14">Quiet 14+ days</option>
              <option value="30">Quiet 30+ days</option>
            </select>
          </div>
          <input
            className="list-area-input"
            aria-label="Filter by area of interest"
            placeholder="Area of interest"
            value={areaOfInterest}
            onChange={(e) => setAreaOfInterest(e.target.value)}
          />

          {hasActiveFilters && (
            <div className="save-search-row">
              {showSaveInput ? (
                <form onSubmit={handleSaveFilter} className="save-search-form">
                  <input
                    aria-label="Name this search"
                    placeholder="Name this search"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    autoFocus
                  />
                  <button type="submit" disabled={saving || !saveName.trim()}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button type="button" onClick={() => setShowSaveInput(false)} disabled={saving}>
                    Cancel
                  </button>
                </form>
              ) : (
                <button type="button" className="save-search-toggle" onClick={() => setShowSaveInput(true)}>
                  + Save this search
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: 'var(--brick-text)' }}>{error}</p>}

      {contacts.length === 0 ? (
        <p>No contacts match.</p>
      ) : (
        <ul>
          {contacts.map((c) => (
            <li key={c.id}>
              <div className="registry-card">
                <div
                  className="registry-card-open"
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(c.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(c.id)}
                >
                  <div className="registry-card-top">
                    <span className="registry-card-name">{c.name}</span>
                    <Chip tone={c.type}>{c.type}</Chip>
                  </div>
                  <span className="registry-card-meta">
                    {c.property_type ? `${c.property_type}` : ''}
                    {c.area_of_interest ? ` · ${c.area_of_interest}` : c.notes ? ` · ${c.notes}` : ''}
                  </span>
                  <div className="registry-card-bottom">
                    <div className="registry-card-actions">
                      <a
                        className="icon-btn-square registry-action"
                        href={telLink(c.phone)}
                        aria-label={`Call ${c.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          startPendingLog({ contactId: c.id, contactName: c.name, source: 'call' })
                        }}
                      >
                        <CallIcon />
                      </a>
                      <a
                        className="icon-btn-square registry-action"
                        href={whatsappLink(c.phone)}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`WhatsApp ${c.name}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          startPendingLog({ contactId: c.id, contactName: c.name, source: 'whatsapp' })
                        }}
                      >
                        <WhatsAppIcon />
                      </a>
                    </div>
                    <span className="stat-pair">
                      <span className="stat-pair-label">Last interaction</span>
                      <span className="stat-pair-value">{lastInteractionLabel(c.last_interaction_date)}</span>
                    </span>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default ContactList
