import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import ContactForm from './ContactForm'
import ContactList from './ContactList'
import ContactDetail from './ContactDetail'
import TodayFollowUps from './TodayFollowUps'
import FollowUpsPage from './FollowUpsPage'
import Listings from './Listings'
import ListingDetail from './ListingDetail'
import ListingForm from './ListingForm'
import CallLogPrompt from './CallLogPrompt'
import BottomNav from './BottomNav'
import Settings from './Settings'
import { setupPushNotifications } from './push'
import './App.css'

function App() {
  const { session, loading, signOut } = useAuth()

  if (loading) {
    return (
      <section id="center">
        <p>Loading...</p>
      </section>
    )
  }

  if (!session) {
    return <Login />
  }

  return <Dashboard session={session} signOut={signOut} />
}

// view:
//   'today' | 'list' | 'settings' | 'followups' | 'listings'
//   | { add: true, returnTo }
//   | { detail: contactId, returnTo }
//   | { edit: contactId, returnTo: 'detail', detailReturnTo }
//   | { listingAdd: true, returnTo }
//   | { listingDetail: listingId, returnTo }
//   | { listingEdit: listingId, returnTo: 'listingDetail', detailReturnTo }
// returnTo/detailReturnTo is always one of the five top-level strings above.
function Dashboard({ session, signOut }) {
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const contactId = params.get('contact')
    return contactId ? { detail: contactId, returnTo: 'today' } : 'today'
  })
  const [listKey, setListKey] = useState(0)
  const [detailRefreshKey, setDetailRefreshKey] = useState(0)
  const [listingListKey, setListingListKey] = useState(0)
  const [listingDetailRefreshKey, setListingDetailRefreshKey] = useState(0)
  const [pushWarning, setPushWarning] = useState(null)
  const [formWarning, setFormWarning] = useState(null)

  useEffect(() => {
    // Clear the deep-link param so a later refresh doesn't re-trigger it.
    if (window.location.search.includes('contact=')) {
      window.history.replaceState({}, '', window.location.pathname)
    }
    // Push reminders failing is silent by default — for a "don't forget
    // this client" app, that's worth surfacing rather than leaving the
    // user to assume reminders are working when they aren't. Only shown on
    // failure; this is not the old step-by-step debug banner.
    setupPushNotifications(session).then((result) => {
      if (result.ok) return
      setPushWarning(
        result.step === 'permission'
          ? "Notifications are turned off, so you won't get push reminders when the app is closed. Enable them in your browser/device settings if you'd like alerts."
          : "Couldn't set up push reminders on this device. You'll still see follow-ups in the app.",
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaved = (saved, warning) => {
    setFormWarning(warning || null)
    if (view.edit) {
      setView({ detail: view.edit, returnTo: view.detailReturnTo })
    } else if (saved && saved.id) {
      setView({ detail: saved.id, returnTo: view.returnTo || 'list' })
    } else {
      setView(view.returnTo || 'list')
    }
    setListKey((k) => k + 1)
  }

  const handleCancelForm = () => {
    setView(view.edit ? { detail: view.edit, returnTo: view.detailReturnTo } : view.returnTo || 'list')
  }

  const handleDeleted = () => {
    setView('list')
    setListKey((k) => k + 1)
  }

  const handleLogged = () => {
    setListKey((k) => k + 1)
    setDetailRefreshKey((k) => k + 1)
  }

  const handleListingSaved = (saved, warning) => {
    setFormWarning(warning || null)
    if (view.listingEdit) {
      setView({ listingDetail: view.listingEdit, returnTo: view.detailReturnTo })
    } else if (saved && saved.id) {
      setView({ listingDetail: saved.id, returnTo: view.returnTo || 'listings' })
    } else {
      setView(view.returnTo || 'listings')
    }
    setListingListKey((k) => k + 1)
    setListingDetailRefreshKey((k) => k + 1)
  }

  const handleCancelListingForm = () => {
    setView(
      view.listingEdit ? { listingDetail: view.listingEdit, returnTo: view.detailReturnTo } : view.returnTo || 'listings',
    )
  }

  const handleListingDeleted = () => {
    setView('listings')
    setListingListKey((k) => k + 1)
  }

  // Every object-shaped view carries the top-level section it was opened
  // from (returnTo, or detailReturnTo one level deeper for edit flows) — so
  // the bottom nav can stay highlighted correctly through detail/edit/add.
  const actualTopLevel = typeof view === 'string' ? view : view.detailReturnTo || view.returnTo || 'list'
  const navKeyFor = (v) => {
    if (v === 'today') return 'home'
    if (v === 'list') return 'contacts'
    if (v === 'followups') return 'followups'
    if (v === 'listings') return 'listings'
    if (v === 'settings') return 'settings'
    return null
  }
  const navActive = navKeyFor(actualTopLevel)

  return (
    <section id="center">
      <div className="appbar">
        <button type="button" className="wordmark" onClick={() => setView('today')}>
          Recall
        </button>
      </div>

      {pushWarning && view !== 'settings' && <p className="push-warning">{pushWarning}</p>}
      {formWarning && <p className="push-warning">{formWarning}</p>}

      <div className="view-pad">
        {(view && view.add) || (view && view.edit) ? (
          <ContactForm session={session} contactId={view.edit} onSaved={handleSaved} onCancel={handleCancelForm} />
        ) : (view && view.listingAdd) || (view && view.listingEdit) ? (
          <ListingForm
            session={session}
            listingId={view.listingEdit}
            onSaved={handleListingSaved}
            onCancel={handleCancelListingForm}
          />
        ) : view && view.detail ? (
          <ContactDetail
            key={`${view.detail}-${detailRefreshKey}`}
            session={session}
            contactId={view.detail}
            onEdit={(id) => setView({ edit: id, returnTo: 'detail', detailReturnTo: view.returnTo })}
            onBack={() => setView(view.returnTo || 'list')}
            onDeleted={handleDeleted}
          />
        ) : view && view.listingDetail ? (
          <ListingDetail
            key={`${view.listingDetail}-${listingDetailRefreshKey}`}
            session={session}
            listingId={view.listingDetail}
            onEdit={(id) => setView({ listingEdit: id, returnTo: 'listingDetail', detailReturnTo: view.returnTo })}
            onBack={() => setView(view.returnTo || 'listings')}
            onDeleted={handleListingDeleted}
            onSelectContact={(id) => setView({ detail: id, returnTo: 'listings' })}
          />
        ) : view === 'today' ? (
          <TodayFollowUps
            session={session}
            onSelectContact={(id) => setView({ detail: id, returnTo: 'today' })}
            onOpenContacts={() => setView('list')}
            onSelectListing={(id) => setView({ listingDetail: id, returnTo: 'today' })}
            onAddContact={() => setView({ add: true, returnTo: 'today' })}
            onAddListing={() => setView({ listingAdd: true, returnTo: 'today' })}
            onOpenFollowUps={() => setView('followups')}
            onOpenSettings={() => setView('settings')}
          />
        ) : view === 'followups' ? (
          <FollowUpsPage session={session} onSelectContact={(id) => setView({ detail: id, returnTo: 'followups' })} />
        ) : view === 'listings' ? (
          <Listings
            key={listingListKey}
            session={session}
            onAdd={() => setView({ listingAdd: true, returnTo: 'listings' })}
            onSelect={(id) => setView({ listingDetail: id, returnTo: 'listings' })}
          />
        ) : view === 'settings' ? (
          <Settings session={session} pushWarning={pushWarning} signOut={signOut} />
        ) : (
          <ContactList
            key={listKey}
            session={session}
            onAdd={() => setView({ add: true, returnTo: 'list' })}
            onSelect={(id) => setView({ detail: id, returnTo: 'list' })}
          />
        )}
      </div>

      <CallLogPrompt session={session} onLogged={handleLogged} />

      <BottomNav
        active={navActive}
        onHome={() => setView('today')}
        onContacts={() => setView('list')}
        onFollowUps={() => setView('followups')}
        onListings={() => setView('listings')}
        onSettings={() => setView('settings')}
      />
    </section>
  )
}

export default App
