import { useEffect, useState } from 'react'
import { useAuth } from './AuthContext'
import Login from './Login'
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
  const [backendStatus, setBackendStatus] = useState('checking...')

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => res.json())
      .then((data) => setBackendStatus(JSON.stringify(data)))
      .catch((err) => setBackendStatus(`error: ${err.message}`))
  }, [session])

  return (
    <section id="center">
      <h1>Recall App</h1>
      <p>Signed in as {session.user.email}</p>
      <p>Backend /api/me: {backendStatus}</p>
      <button type="button" onClick={signOut}>
        Sign out
      </button>
    </section>
  )
}

export default App
