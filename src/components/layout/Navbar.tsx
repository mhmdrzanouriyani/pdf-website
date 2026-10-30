import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Menu, Search, UserRound, X } from 'lucide-react'
import { Wordmark } from '../ui/Logo'
import { openCommandPalette } from '../command/CommandPalette'
import { useAuth } from '../../state/AuthContext'

const links = [
  { to: '/#product', label: 'Product' },
  { to: '/tools', label: 'All PDF Tools' },
  { to: '/ai', label: 'AI Tools' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/faq', label: 'FAQ' },
]

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const location = useLocation()
  const { user } = useAuth()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile menu after navigating.
  const [lastPath, setLastPath] = useState(location.pathname + location.hash)
  if (lastPath !== location.pathname + location.hash) {
    setLastPath(location.pathname + location.hash)
    if (open) setOpen(false)
  }

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'is-active' : '')

  return (
    <header className={`site-nav ${scrolled ? 'is-scrolled' : ''} ${open ? 'is-open' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <div className="site-nav-inner">
        <Link to="/" className="site-nav-brand" aria-label="PDFLY home">
          <Wordmark />
        </Link>

        <nav className="site-nav-links" aria-label="Primary">
          {links.map((link) =>
            link.to.includes('#') ? (
              <Link key={link.to} to={link.to}>
                {link.label}
              </Link>
            ) : (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            ),
          )}
        </nav>

        <div className="site-nav-actions">
          <button type="button" className="cmd-hint" onClick={openCommandPalette} aria-label="Search tools">
            <Search size={14} />
            <span>Search</span>
            <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
          </button>
          {user ? (
            <NavLink to="/account" className="ghost-link nav-account">
              <UserRound size={15} /> {user.name || 'Account'}
            </NavLink>
          ) : (
            <>
              <NavLink to="/login" className="ghost-link">
                Log in
              </NavLink>
              <NavLink to="/signup" className="btn btn-primary btn-sm">
                Sign up
              </NavLink>
            </>
          )}
          <button
            type="button"
            className="nav-toggle"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      <div id="mobile-nav" className="mobile-nav" hidden={!open}>
        <nav aria-label="Mobile">
          {links.map((link) => (
            <Link key={link.to} to={link.to} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
          <Link to="/workspace" onClick={() => setOpen(false)}>
            Workspace
          </Link>
        </nav>
        <div className="mobile-nav-actions">
          <button
            type="button"
            className="btn btn-outline btn-md"
            onClick={() => {
              setOpen(false)
              openCommandPalette()
            }}
          >
            <Search size={15} /> Search tools
          </button>
          {user ? (
            <NavLink to="/account" className="btn btn-primary btn-md" onClick={() => setOpen(false)}>
              Account
            </NavLink>
          ) : (
            <>
              <NavLink to="/login" className="btn btn-outline btn-md" onClick={() => setOpen(false)}>
                Log in
              </NavLink>
              <NavLink to="/signup" className="btn btn-primary btn-md" onClick={() => setOpen(false)}>
                Sign up
              </NavLink>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
