import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { Navbar } from '../components/layout/Navbar'
import { Footer } from '../components/layout/Footer'
import { Wordmark } from '../components/ui/Logo'
import { useAuth } from '../state/AuthContext'
import { api, jsonBody } from '../lib/api'

function ServerNotice() {
  const { available } = useAuth()
  if (available) return null
  return (
    <p className="auth-notice" role="status">
      <TriangleAlert size={14} aria-hidden="true" /> Accounts need the PDFLY server, which isn’t reachable. You can still use every PDF tool without an account.
    </p>
  )
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  useEffect(() => {
    document.title = `${title} — PDFLY`
  }, [title])
  return (
    <>
      <Navbar />
      <main className="auth" id="main">
        {children}
      </main>
      <Footer />
    </>
  )
}

export function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const navigate = useNavigate()
  const location = useLocation()
  const auth = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const isSignup = mode === 'signup'
  const next = (location.state as { from?: string } | null)?.from ?? '/account'

  useEffect(() => {
    if (auth.user) navigate(next, { replace: true })
  }, [auth.user, navigate, next])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isSignup) await auth.signup(email, password, name)
      else await auth.login(email, password)
      navigate(next, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title={isSignup ? 'Sign up' : 'Log in'}>
      <form className="auth-card" onSubmit={onSubmit} noValidate={false}>
        <Wordmark />
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p>{isSignup ? 'An account saves your AI preferences. PDF tools work without one.' : 'Log in to sync your preferences.'}</p>
        <ServerNotice />
        {isSignup && (
          <label>
            Name <span className="muted">(optional)</span>
            <input autoComplete="name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
          </label>
        )}
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={isSignup ? 8 : 1}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isSignup ? 'At least 8 characters' : ''}
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-md" disabled={busy || !auth.available}>
          {busy && <LoaderCircle size={15} className="spin" />}
          {isSignup ? 'Create account' : 'Log in'}
        </button>
        {!isSignup && (
          <p className="auth-switch">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        )}
        <p className="auth-switch">
          {isSignup ? (
            <>
              Already have an account? <Link to="/login">Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/signup">Sign up</Link>
            </>
          )}
        </p>
      </form>
    </Shell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState<null | { devConsole: boolean }>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setSent(await api<{ devConsole: boolean }>('/api/auth/forgot', jsonBody({ email })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Shell title="Reset password">
      <form className="auth-card" onSubmit={onSubmit}>
        <Wordmark />
        <h1>Reset your password</h1>
        <ServerNotice />
        {sent ? (
          <div role="status">
            <p>If an account exists for {email}, a reset link has been created. It is valid for 30 minutes.</p>
            {sent.devConsole && (
              <p className="auth-notice">
                <TriangleAlert size={14} aria-hidden="true" /> No email service is configured on this server. In development, the reset link is printed in the server console.
              </p>
            )}
          </div>
        ) : (
          <>
            <label>
              Email
              <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </label>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-md" disabled={busy}>
              Send reset link
            </button>
          </>
        )}
        <p className="auth-switch">
          <Link to="/login">Back to log in</Link>
        </p>
      </form>
    </Shell>
  )
}

export function ResetPasswordPage() {
  const location = useLocation()
  const token = new URLSearchParams(location.search).get('token') ?? ''
  const [password, setPassword] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await api('/api/auth/reset', jsonBody({ token, password }))
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    }
  }

  return (
    <Shell title="Choose a new password">
      <form className="auth-card" onSubmit={onSubmit}>
        <Wordmark />
        <h1>Choose a new password</h1>
        {done ? (
          <p role="status">
            Your password was changed and other sessions were signed out. <Link to="/login">Log in</Link>
          </p>
        ) : !token ? (
          <p className="field-error">This link is missing its token. Request a new reset link.</p>
        ) : (
          <>
            <label>
              New password
              <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            {error && <p className="field-error">{error}</p>}
            <button type="submit" className="btn btn-primary btn-md">
              Save password
            </button>
          </>
        )}
      </form>
    </Shell>
  )
}
