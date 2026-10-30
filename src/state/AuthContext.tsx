import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, jsonBody } from '../lib/api'
import { writePref } from '../lib/prefs'

export type Preferences = { responseLanguage: string; summaryLength: 'short' | 'medium' | 'detailed'; translateTo: string }
export type User = { id: string; email: string; name: string; createdAt: number; preferences: Preferences }

type AuthValue = {
  user: User | null
  loading: boolean
  /** false when the API server is not reachable (accounts unavailable). */
  available: boolean
  login: (email: string, password: string) => Promise<User>
  signup: (email: string, password: string, name: string) => Promise<User>
  logout: () => Promise<void>
  update: (patch: { name?: string; preferences?: Partial<Preferences> }) => Promise<User>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)

/** Mirrors account preferences into the local preference store used by the Copilot and AI tools. */
function syncPrefs(user: User | null) {
  if (!user) return
  writePref('responseLanguage', user.preferences.responseLanguage)
  writePref('summaryLength', user.preferences.summaryLength)
  writePref('translateTo', user.preferences.translateTo)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [available, setAvailable] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api<{ user: User | null }>('/api/auth/me', { timeoutMs: 8000 })
      setUser(me)
      setAvailable(true)
      syncPrefs(me)
    } catch (error) {
      setUser(null)
      if (error instanceof ApiError && error.code === 'unreachable') setAvailable(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      available,
      refresh,
      login: async (email, password) => {
        const { user: me } = await api<{ user: User }>('/api/auth/login', jsonBody({ email, password }))
        setUser(me)
        syncPrefs(me)
        return me
      },
      signup: async (email, password, name) => {
        const { user: me } = await api<{ user: User }>('/api/auth/register', jsonBody({ email, password, name }))
        setUser(me)
        syncPrefs(me)
        return me
      },
      logout: async () => {
        await api('/api/auth/logout', jsonBody({})).catch(() => undefined)
        setUser(null)
      },
      update: async (patch) => {
        const { user: me } = await api<{ user: User }>('/api/auth/me', { ...jsonBody(patch), method: 'PATCH' })
        setUser(me)
        syncPrefs(me)
        return me
      },
    }),
    [user, loading, available, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
