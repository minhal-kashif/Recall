import { useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import ContactForm from './ContactForm'
import ContactList from './ContactList'
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

function Dashboard({ session, signOut }) {
  const [view, setView] = useState('list') // 'list' | 'add' | { edit: contactId }
  const [listKey, setListKey] = useState(0)

  const handleSaved = () => {
    setView('list')
    setListKey((k) => k + 1)
  }

  return (
    <section id="center">
      <h1>Recall App</h1>
      <p>Signed in as {session.user.email}</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>

      {view === 'add' || (view && view.edit) ? (
        <ContactForm
          session={session}
          contactId={view.edit}
          onSaved={handleSaved}
          onCancel={() => setView('list')}
        />
      ) : (
        <ContactList
          key={listKey}
          session={session}
          onAdd={() => setView('add')}
          onSelect={(id) => setView({ edit: id })}
        />
      )}
    </section>
  )
}

export default App
