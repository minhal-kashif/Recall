import './BottomNav.css'

function HomeIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
    </svg>
  )
}

function ContactsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zm0 2c-4 0-9 2-9 6v2h18v-2c0-4-5-6-9-6z"
      />
    </svg>
  )
}

function FollowUpsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M8 6h13v2H8zM8 11h13v2H8zM8 16h13v2H8zM3 6h2v2H3zM3 11h2v2H3zM3 16h2v2H3z" />
    </svg>
  )
}

function ListingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M5 3h10v18H5zM17 9h4v12h-4zM8 6h2v2H8zM12 6h2v2h-2zM8 10h2v2H8zM12 10h2v2h-2zM8 14h2v2H8zM12 14h2v2h-2z"
      />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.5.5 0 0 0 .12-.61l-1.92-3.32a.5.5 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94L14.4 2.81a.49.49 0 0 0-.48-.41h-3.84a.49.49 0 0 0-.47.41L9.25 5.35c-.59.24-1.13.57-1.62.94L5.24 5.33a.5.5 0 0 0-.59.22L2.74 8.87a.5.5 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.5.5 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.5.5 0 0 0-.12-.61zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2"
      />
    </svg>
  )
}

function BottomNav({ active, onHome, onContacts, onFollowUps, onListings, onSettings }) {
  return (
    <nav className="bottom-nav">
      <button
        type="button"
        className={`bottom-nav-item${active === 'home' ? ' active' : ''}`}
        onClick={onHome}
        aria-label="Home"
        aria-current={active === 'home' ? 'page' : undefined}
      >
        <HomeIcon />
      </button>
      <button
        type="button"
        className={`bottom-nav-item${active === 'contacts' ? ' active' : ''}`}
        onClick={onContacts}
        aria-label="Contacts"
        aria-current={active === 'contacts' ? 'page' : undefined}
      >
        <ContactsIcon />
      </button>
      <button
        type="button"
        className={`bottom-nav-item${active === 'followups' ? ' active' : ''}`}
        onClick={onFollowUps}
        aria-label="Follow-ups"
        aria-current={active === 'followups' ? 'page' : undefined}
      >
        <FollowUpsIcon />
      </button>
      <button
        type="button"
        className={`bottom-nav-item${active === 'listings' ? ' active' : ''}`}
        onClick={onListings}
        aria-label="Listings"
        aria-current={active === 'listings' ? 'page' : undefined}
      >
        <ListingsIcon />
      </button>
      <button
        type="button"
        className={`bottom-nav-item${active === 'settings' ? ' active' : ''}`}
        onClick={onSettings}
        aria-label="Settings"
        aria-current={active === 'settings' ? 'page' : undefined}
      >
        <SettingsIcon />
      </button>
    </nav>
  )
}

export default BottomNav
