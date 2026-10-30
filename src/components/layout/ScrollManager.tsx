import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Scrolls to the hash target (e.g. /#faq) or to the top on navigation. */
export function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      // Wait a frame so lazy sections exist.
      const id = window.setTimeout(() => {
        document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 60)
      return () => window.clearTimeout(id)
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}
