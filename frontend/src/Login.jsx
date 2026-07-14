import { useAuth } from './AuthContext'

function Login() {
  const { signInWithGoogle } = useAuth()

  return (
    <section id="center">
      <h1>Recall</h1>
      <p>Sign in to manage your contacts.</p>
      <button type="button" onClick={signInWithGoogle}>
        Continue with Google
      </button>
    </section>
  )
}

export default Login
