import { useState } from 'react'
import { getStoredTheme, applyTheme } from './theme'
import './Settings.css'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

function Settings({ session, pushWarning, signOut }) {
  const [theme, setTheme] = useState(getStoredTheme)

  const handleThemeChange = (value) => {
    applyTheme(value)
    setTheme(value)
  }

  const displayName = session.user.user_metadata?.full_name || session.user.email
  const avatarUrl = session.user.user_metadata?.avatar_url

  return (
    <div className="settings-page">
      <h2 className="registry-title settings-page-title">Settings</h2>

      <p className="section-label">Account</p>
      <div className="settings-card settings-profile-card">
        {avatarUrl && <img className="home-avatar" src={avatarUrl} alt="" />}
        <div>
          <span className="settings-email">{displayName}</span>
          <span className="settings-sub">{session.user.email} · Signed in with Google</span>
        </div>
      </div>

      <p className="section-label">Appearance</p>
      <div className="theme-toggle" role="group" aria-label="Theme">
        {THEME_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`theme-option${theme === opt.value ? ' active' : ''}`}
            aria-pressed={theme === opt.value}
            onClick={() => handleThemeChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="settings-sub theme-hint">
        {theme === 'system' ? "Matches your device's light/dark setting." : `Always ${theme} mode, on this device.`}
      </p>

      <p className="section-label">Notifications</p>
      <div className="settings-card">
        {pushWarning ? (
          <p className="settings-notice settings-notice-warn">{pushWarning}</p>
        ) : (
          <p className="settings-notice settings-notice-ok">Push reminders are on for this device.</p>
        )}
      </div>

      <button type="button" className="signout-btn-full" onClick={signOut}>
        Sign out
      </button>
    </div>
  )
}

export default Settings
