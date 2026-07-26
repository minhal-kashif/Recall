import './Chip.css'

// Small categorical/status badge reused across the contact list, contact
// detail, today's follow-ups, and the follow-up status list — one place to
// keep the buyer/seller/lead/tenant + overdue/done/snoozed color mapping
// consistent instead of repeating it per screen.
function Chip({ tone, children }) {
  return <span className={`chip chip-${tone}`}>{children}</span>
}

export default Chip
