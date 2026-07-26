export const THEME_KEY = 'recall_theme'
export const THEMES = ['system', 'light', 'dark']

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY)
  return THEMES.includes(stored) ? stored : 'system'
}

// 'system' means "follow the device" — remove the override and let the
// existing @media (prefers-color-scheme) rules in index.css take over.
export function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme)
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem(THEME_KEY, theme)
}
