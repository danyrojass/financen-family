import * as React from 'react'

export type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeContextValue {
  theme: ThemeMode
  resolved: 'light' | 'dark'
  setTheme: (theme: ThemeMode) => void
}

const STORAGE_KEY = 'finanzas.theme'
const ThemeContext = React.createContext<ThemeContextValue | null>(null)

function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeMode>(readStoredTheme)
  const [systemDark, setSystemDark] = React.useState(systemPrefersDark)

  React.useEffect(() => {
    if (!window.matchMedia) return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', listener)
    return () => media.removeEventListener('change', listener)
  }, [])

  const resolved: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  React.useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', resolved === 'dark')
    root.style.colorScheme = resolved
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#0a1311' : '#0f766e')
  }, [resolved])

  const setTheme = React.useCallback((next: ThemeMode) => {
    setThemeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // almacenamiento no disponible (modo privado): se mantiene en memoria
    }
  }, [])

  const value = React.useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (!context) throw new Error('useTheme debe usarse dentro de ThemeProvider')
  return context
}
