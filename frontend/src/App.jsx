import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
import ContactForm from './ContactForm'
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
  const [contacts, setContacts] = useState([])
  const [view, setView] = useState('list') // 'list' | 'add' | { edit: contactId }
  const [contactsError, setContactsError] = useState(null)

  const apiUrl = import.meta.env.VITE_API_URL
  const authHeaders = { Authorization: `Bearer ${session.access_token}` }

  const loadContacts = () => {
    fetch(`${apiUrl}/api/contacts`, { headers: authHeaders })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setContacts(data) : setContactsError(data.error)))
      .catch((err) => setContactsError(err.message))
  }

  useEffect(() => {
    loadContacts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaved = () => {
    setView('list')
    loadContacts()
  }

  if (view === 'add' || (view && view.edit)) {
    return (
      <section id="center">
        <ContactForm
          session={session}
          contactId={view.edit}
          onSaved={handleSaved}
          onCancel={() => setView('list')}
        />
      </section>
    )
  }

  return (
    <section id="center">
      <h1>Recall App</h1>
      <p>Signed in as {session.user.email}</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>

      <h2>Contacts</h2>
      <button type="button" onClick={() => setView('add')}>
        + Add Contact
      </button>

      {contactsError && <p style={{ color: 'red' }}>{contactsError}</p>}

      <ul>
        {contacts.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => setView({ edit: c.id })}>
              {c.name} — {c.type} — {c.phone}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

export default App
