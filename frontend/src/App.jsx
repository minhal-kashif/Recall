import { useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import ContactForm from './ContactForm'
import ContactList from './ContactList'
import ContactDetail from './ContactDetail'
import TodayFollowUps from './TodayFollowUps'
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
  const [view, setView] = useState('today')
  const [listKey, setListKey] = useState(0)

  const handleSaved = () => {
    setView(view.edit ? { detail: view.edit, returnTo: view.detailReturnTo } : 'list')
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
