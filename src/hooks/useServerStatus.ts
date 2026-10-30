import { useCallback, useEffect, useState } from 'react'
import { getHealth, type ServerHealth } from '../lib/api'

export type ServerStatus = {
  loading: boolean
  /** null when the API server is not reachable. */
  health: ServerHealth | null
  refresh: () => void
}

export function useServerStatus(): ServerStatus {
  const [health, setHealth] = useState<ServerHealth | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback((force: boolean) => {
    setLoading(true)
    getHealth(force)
      .then(setHealth)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load(false)
  }, [load])

  return { loading, health, refresh: () => load(true) }
}

/** Human-readable reason AI features are unavailable, or null if they work. */
export function aiUnavailableReason(status: ServerStatus) {
  if (status.loading) return null
  if (!status.health) return 'The PDFLY server is not running, so AI features are unavailable. Start it with “npm run dev”.'
  if (!status.health.ai.configured) return status.health.ai.problem ?? 'AI is not configured on the server.'
  return null
}

export function officeUnavailableReason(status: ServerStatus) {
  if (status.loading) return null
  if (!status.health) return 'The PDFLY server is not running. Office conversions need it — start it with “npm run dev”.'
  if (!status.health.office.available) {
    return 'LibreOffice is not installed on the server, so Office conversions are unavailable. Install LibreOffice or set LIBREOFFICE_PATH, then restart the server.'
  }
  return null
}
