import { useAuth } from './AuthContext'
import './Login.css'

function Login() {
  const { signInWithGoogle } = useAuth()

  return (
    <main id="center" className="login-screen">
      <div className="tab-strip">
        <span className="buyer"></span>
        <span className="seller"></span>
        <span className="lead"></span>
        <span className="tenant"></span>
      </div>
      <h1 className="login-wordmark">Recall</h1>
      <p className="login-tagline">You talk, it organizes.</p>
      <p className="login-sub">Your contacts, follow-ups, and notes — in one place.</p>
      <button type="button" className="google-btn" onClick={signInWithGoogle}>
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
          ></path>
          <path
            fill="#34A853"
            d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.35 0-4.34-1.58-5.05-3.71H.94v2.33A9 9 0 0 0 9 18z"
          ></path>
          <path fill="#FBBC05" d="M3.95 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.94a9 9 0 0 0 0 8.08l3.01-2.33z"></path>
          <path
            fill="#EA4335"
            d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.96l3.01 2.33C4.66 5.16 6.65 3.58 9 3.58z"
          ></path>
        </svg>
        Continue with Google
      </button>
      <p className="login-footnote">Google Sign-In only — no passwords to remember or reset.</p>
    </main>
  )
}

export default Login
