import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import ContactForm from './ContactForm'
import ContactList from './ContactList'
import ContactDetail from './ContactDetail'
import TodayFollowUps from './TodayFollowUps'
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
//   'today' | 'list' | 'add'
//   | { detail: contactId, returnTo: 'today' | 'list' }
//   | { edit: contactId, returnTo: 'detail', detailReturnTo: 'today' | 'list' }
function Dashboard({ session, signOut }) {
  const [view, setView] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    const contactId = params.get('contact')
    return contactId ? { detail: contactId, returnTo: 'today' } : 'today'
  })
  const [listKey, setListKey] = useState(0)
  const [pushWarning, setPushWarning] = useState(null)

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

  const handleSaved = (saved) => {
    if (view.edit) {
      setView({ detail: view.edit, returnTo: view.detailReturnTo })
    } else if (saved && saved.id) {
      setView({ detail: saved.id, returnTo: 'list' })
    } else {
      setView('list')
    }
    setListKey((k) => k + 1)
  }

  const handleCancelForm = () => {
    setView(view.edit ? { detail: view.edit, returnTo: view.detailReturnTo } : 'list')
  }

  return (
    <section id="center">
      <h1>Recall App</h1>
      <p>Signed in as {session.user.email}</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>

      {pushWarning && <p style={{ color: '#b45309' }}>🔕 {pushWarning}</p>}

      <nav>
        <button type="button" onClick={() => setView('today')}>
          Today's Follow-Ups
        </button>
        <button type="button" onClick={() => setView('list')}>
          All Contacts
        </button>
      </nav>

      {view === 'add' || (view && view.edit) ? (
        <ContactForm session={session} contactId={view.edit} onSaved={handleSaved} onCancel={handleCancelForm} />
      ) : view && view.detail ? (
        <ContactDetail
          session={session}
          contactId={view.detail}
          onEdit={(id) => setView({ edit: id, returnTo: 'detail', detailReturnTo: view.returnTo })}
          onBack={() => setView(view.returnTo || 'list')}
        />
      ) : view === 'today' ? (
        <TodayFollowUps session={session} onSelectContact={(id) => setView({ detail: id, returnTo: 'today' })} />
      ) : (
        <ContactList
          key={listKey}
          session={session}
          onAdd={() => setView('add')}
          onSelect={(id) => setView({ detail: id, returnTo: 'list' })}
        />
      )}
    </section>
  )
}

export default App
