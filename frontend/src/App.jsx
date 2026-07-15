import { useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import ContactForm from './ContactForm'
import ContactList from './ContactList'
import ContactDetail from './ContactDetail'
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

// view: 'list' | 'add' | { detail: contactId } | { edit: contactId, returnTo: 'list' | 'detail' }
function Dashboard({ session, signOut }) {
  const [view, setView] = useState('list')
  const [listKey, setListKey] = useState(0)

  const handleSaved = () => {
    setView(view.edit && view.returnTo === 'detail' ? { detail: view.edit } : 'list')
    setListKey((k) => k + 1)
  }

  const handleCancelForm = () => {
    setView(view.edit && view.returnTo === 'detail' ? { detail: view.edit } : 'list')
  }

  return (
    <section id="center">
      <h1>Recall App</h1>
      <p>Signed in as {session.user.email}</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>

      {view === 'add' || (view && view.edit) ? (
        <ContactForm session={session} contactId={view.edit} onSaved={handleSaved} onCancel={handleCancelForm} />
      ) : view && view.detail ? (
        <ContactDetail
          session={session}
          contactId={view.detail}
          onEdit={(id) => setView({ edit: id, returnTo: 'detail' })}
          onBack={() => setView('list')}
        />
      ) : (
        <ContactList
          key={listKey}
          session={session}
          onAdd={() => setView('add')}
          onSelect={(id) => setView({ detail: id })}
        />
      )}
    </section>
  )
}

export default App
