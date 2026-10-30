import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Navbar } from '../components/layout/Navbar'
import { Footer } from '../components/layout/Footer'
import { useAuth, type Preferences } from '../state/AuthContext'
import { useDocuments } from '../state/DocumentsContext'
import { useToast } from '../state/ToastContext'
import { LANGUAGES } from '../components/workspace/AICopilot'
import { api, jsonBody } from '../lib/api'
import { formatBytes } from '../config/limits'

export function AccountPage() {
  const auth = useAuth()
  const documents = useDocuments()
  const navigate = useNavigate()
  const { notify } = useToast()
  const [name, setName] = useState('')
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [deletePw, setDeletePw] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    document.title = 'Account — PDFLY'
    if (auth.user) {
      setName(auth.user.name)
      setPrefs(auth.user.preferences)
    }
  }, [auth.user])

  if (auth.loading) return <div className="page-loading" role="status" aria-label="Loading" />
  if (!auth.user) return <Navigate to="/login" replace state={{ from: '/account' }} />

  const used = documents.docs.reduce((sum, doc) => sum + doc.size, 0)

  async function saveProfile(event: FormEvent) {
    event.preventDefault()
    try {
      await auth.update({ name, preferences: prefs ?? undefined })
      notify('Saved.', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not save.', 'error')
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault()
    try {
      await api('/api/auth/password', jsonBody({ current, next }))
      setCurrent('')
      setNext('')
      notify('Password changed. Other sessions were signed out.', 'success')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not change the password.', 'error')
    }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault()
    try {
      await api('/api/auth/me', { ...jsonBody({ password: deletePw }), method: 'DELETE' })
      await auth.refresh()
      notify('Your account was deleted.', 'success')
      navigate('/')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not delete the account.', 'error')
    }
  }

  return (
    <>
      <Navbar />
      <main className="account" id="main">
        <header className="section-copy">
          <p className="section-kicker">Account</p>
          <h1>{auth.user.name || auth.user.email}</h1>
          <p>Signed in as {auth.user.email}</p>
        </header>

        <section className="account-card" aria-labelledby="profile-h">
          <h2 id="profile-h">Profile & AI preferences</h2>
          <form onSubmit={saveProfile} className="account-form">
            <label>
              Name
              <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </label>
            {prefs && (
              <>
                <label>
                  Copilot replies in
                  <select value={prefs.responseLanguage} onChange={(e) => setPrefs({ ...prefs, responseLanguage: e.target.value })}>
                    <option value="auto">Document / question language</option>
                    {LANGUAGES.map((lang) => (
                      <option key={lang}>{lang}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Default summary length
                  <select value={prefs.summaryLength} onChange={(e) => setPrefs({ ...prefs, summaryLength: e.target.value as Preferences['summaryLength'] })}>
                    <option value="short">Short</option>
                    <option value="medium">Medium</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
                <label>
                  Translate to
                  <select value={prefs.translateTo} onChange={(e) => setPrefs({ ...prefs, translateTo: e.target.value })}>
                    {LANGUAGES.map((lang) => (
                      <option key={lang}>{lang}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <button type="submit" className="btn btn-primary btn-md">
              Save
            </button>
          </form>
        </section>

        <section className="account-card" aria-labelledby="docs-h">
          <h2 id="docs-h">Documents</h2>
          <p>
            Your recent documents ({documents.docs.length}, {formatBytes(used)}) are stored only in this browser — they are not uploaded to your account and do not sync
            between devices.
          </p>
          <div className="tool-actions">
            <Link to="/workspace" className="btn btn-outline btn-md">
              Open workspace
            </Link>
            <button
              type="button"
              className="btn btn-ghost btn-md"
              disabled={documents.docs.length === 0}
              onClick={async () => {
                await documents.clear()
                notify('Recent documents removed from this browser.', 'success')
              }}
            >
              Clear documents in this browser
            </button>
          </div>
        </section>

        <section className="account-card" aria-labelledby="pw-h">
          <h2 id="pw-h">Change password</h2>
          <form onSubmit={changePassword} className="account-form">
            <label>
              Current password
              <input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </label>
            <label>
              New password
              <input type="password" autoComplete="new-password" minLength={8} required value={next} onChange={(e) => setNext(e.target.value)} />
            </label>
            <button type="submit" className="btn btn-outline btn-md">
              Change password
            </button>
          </form>
        </section>

        <section className="account-card" aria-labelledby="session-h">
          <h2 id="session-h">Session</h2>
          <div className="tool-actions">
            <button
              type="button"
              className="btn btn-outline btn-md"
              onClick={async () => {
                await auth.logout()
                navigate('/')
              }}
            >
              Log out
            </button>
          </div>
          {confirmDelete ? (
            <form onSubmit={deleteAccount} className="account-form danger">
              <p>This permanently deletes your account and preferences. Enter your password to confirm.</p>
              <label>
                Password
                <input type="password" autoComplete="current-password" required value={deletePw} onChange={(e) => setDeletePw(e.target.value)} />
              </label>
              <div className="tool-actions">
                <button type="submit" className="btn btn-primary btn-md">
                  Delete account
                </button>
                <button type="button" className="btn btn-ghost btn-md" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button type="button" className="link-btn" onClick={() => setConfirmDelete(true)}>
              Delete my account
            </button>
          )}
        </section>
      </main>
      <Footer />
    </>
  )
}
