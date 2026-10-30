import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { Wordmark } from '../components/ui/Logo'
import { WorkspaceShell } from '../components/workspace/WorkspaceShell'
import { openCommandPalette } from '../components/command/CommandPalette'

type WorkspaceState = { openId?: string }

export function WorkspacePage() {
  const location = useLocation()
  const state = (location.state ?? {}) as WorkspaceState
  const params = new URLSearchParams(location.search)
  const openId = state.openId ?? params.get('doc') ?? undefined

  useEffect(() => {
    document.title = 'Workspace — PDFLY'
  }, [])

  return (
    <div className="workspace-page">
      <header className="workspace-page-nav">
        <Link to="/" className="site-nav-brand" aria-label="PDFLY home">
          <Wordmark compact />
        </Link>
        <nav className="workspace-page-links" aria-label="Workspace navigation">
          <Link to="/tools" className="ghost-link">
            All PDF tools
          </Link>
          <Link to="/ai" className="ghost-link">
            AI tools
          </Link>
          <button type="button" className="cmd-hint" onClick={openCommandPalette}>
            Search <kbd>Ctrl K</kbd>
          </button>
        </nav>
        <Link to="/" className="ghost-link">
          <ArrowLeft size={15} />
          Back to site
        </Link>
      </header>
      <main id="main">
        <h1 className="sr-only">PDFLY workspace</h1>
        <WorkspaceShell initialDocId={openId} />
      </main>
    </div>
  )
}
