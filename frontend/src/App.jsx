import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import './App.css'

function App() {
  const [backendStatus, setBackendStatus] = useState('checking...')
  const [supabaseStatus, setSupabaseStatus] = useState('checking...')

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setBackendStatus(JSON.stringify(data)))
      .catch((err) => setBackendStatus(`error: ${err.message}`))

    supabase.auth.getSession()
      .then(({ error }) => setSupabaseStatus(error ? `error: ${error.message}` : 'client initialized'))
      .catch((err) => setSupabaseStatus(`error: ${err.message}`))
  }, [])

  return (
    <section id="center">
      <h1>Recall App</h1>
      <p>Backend health: {backendStatus}</p>
      <p>Supabase client: {supabaseStatus}</p>
    </section>
  )
}

export default App
