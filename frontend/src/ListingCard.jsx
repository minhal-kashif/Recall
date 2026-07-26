import { formatAmount } from './formatAmount'
import Chip from './Chip'
import './Listings.css'

const STATUS_LABELS = {
  available: 'Available',
  under_offer: 'Under offer',
  sold: 'Sold',
  rented: 'Rented',
}

function PinIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"
      />
    </svg>
  )
}

function SizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 10V4h6M20 14v6h-6"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function BedIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="11" width="18" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="5" y="8" width="6" height="3.5" rx="1" fill="currentColor" />
      <path d="M3 17v2M21 17v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function TagIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3h8l10 10-8 8L3 11z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="7.5" cy="7.5" r="1.3" fill="currentColor" />
    </svg>
  )
}

function StarIcon({ filled }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}

function daysOnMarket(createdAt) {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)))
}

async function shareListing(listing, event) {
  event.stopPropagation()
  const text = `${listing.property_address} — ${formatAmount(listing.asking_price)}`
  if (navigator.share) {
    try {
      await navigator.share({ title: listing.property_address, text })
    } catch {
      // user cancelled the share sheet — nothing to do
    }
  } else if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // clipboard write can fail without permission — silently ignore
    }
  }
}

// Shared listing card — used on the Listings page and the Home Featured
// strip, so both places always look identical.
//
// Rendered as a div with role="button" rather than a real <button> because
// the star toggle inside it needs to be its own real, independently
// focusable <button> — nesting a <button> inside a <button> is invalid HTML.
function ListingCard({ listing, onSelect, onToggleFeatured, layout = 'column' }) {
  const openDetail = () => onSelect(listing.id)

  const handleStarClick = (event) => {
    event.stopPropagation()
    onToggleFeatured(listing.id, !listing.is_featured)
  }

  return (
    <li>
      <div
        className={`listing-card${layout === 'row' ? ' listing-card--row' : ''}`}
        role="button"
        tabIndex={0}
        onClick={openDetail}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openDetail()}
      >
        <div className="listing-photo">
          {listing.photo_url ? (
            <img src={listing.photo_url} alt="" />
          ) : (
            <div className="listing-photo-placeholder">No photo</div>
          )}
          {listing.property_type && <span className="listing-type-badge">{listing.property_type}</span>}
          {onToggleFeatured && (
            <button
              type="button"
              className={`listing-star${listing.is_featured ? ' active' : ''}`}
              onClick={handleStarClick}
              aria-label={listing.is_featured ? 'Remove from featured' : 'Add to featured'}
              aria-pressed={Boolean(listing.is_featured)}
            >
              <StarIcon filled={Boolean(listing.is_featured)} />
            </button>
          )}
        </div>
        <div className="listing-body">
          <div className="listing-top-row">
            <span className="listing-owner">
              <PinIcon />
              {listing.contact_name || 'Unlinked'}
            </span>
            <span className="listing-price">{formatAmount(listing.asking_price)}</span>
          </div>
          <div className="listing-address-row">
            <span className="listing-address">{listing.property_address}</span>
            {listing.status && <Chip tone={listing.status}>{STATUS_LABELS[listing.status] || listing.status}</Chip>}
          </div>
          <div className="listing-stats">
            <span className="listing-stat">
              <SizeIcon />
              {listing.size_sqyd ? `${listing.size_sqyd} sq.y` : '—'}
            </span>
            <span className="listing-stat">
              <BedIcon />
              {listing.beds ? `${listing.beds} bhk` : '—'}
            </span>
            <span className="listing-stat">
              <TagIcon />
              {formatAmount(listing.asking_price)}
            </span>
          </div>
          <div className="listing-footer-row">
            <span className="listing-footer-stats">
              <span className="stat-pair">
                <span className="stat-pair-label">Leads</span>
                <span className="stat-pair-value">{listing.interested_count ?? 0}</span>
              </span>
              <span className="stat-pair">
                <span className="stat-pair-label">Days listed</span>
                <span className="stat-pair-value">{daysOnMarket(listing.created_at)}</span>
              </span>
            </span>
            <button type="button" className="ledger-btn-outline listing-share-btn" onClick={(e) => shareListing(listing, e)}>
              Share
            </button>
          </div>
        </div>
      </div>
    </li>
  )
}

export default ListingCard
