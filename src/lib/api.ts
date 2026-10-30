export class ApiError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const UNREACHABLE =
  'The PDFLY server is not reachable. Start it with “npm run dev” (or “npm run dev:server”) and try again.'

/** fetch wrapper with consistent, user-readable errors and timeouts. */
export async function api<T>(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 60_000, signal, ...rest } = init
  const timeout = AbortSignal.timeout(timeoutMs)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  let response: Response
  try {
    response = await fetch(path, { credentials: 'same-origin', ...rest, signal: combined })
  } catch (error) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    if ((error as Error)?.name === 'TimeoutError' || timeout.aborted) {
      throw new ApiError(504, 'timeout', 'The request took too long. Please try again.')
    }
    throw new ApiError(0, 'unreachable', UNREACHABLE)
  }
  const type = response.headers.get('content-type') ?? ''
  if (!response.ok) {
    if (type.includes('application/json')) {
      const body = (await response.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
      throw new ApiError(response.status, body?.error?.code ?? 'error', body?.error?.message ?? `Request failed (${response.status}).`)
    }
    // The Vite proxy answers 500/502/504 with HTML/plain text when the API server is down.
    if (response.status >= 500) throw new ApiError(response.status, 'unreachable', UNREACHABLE)
    throw new ApiError(response.status, 'error', `Request failed (${response.status}).`)
  }
  if (type.includes('application/json')) return (await response.json()) as T
  return (await response.blob()) as T
}

export function jsonBody(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export type ServerHealth = {
  ok: boolean
  ai: { configured: boolean; provider: string | null; model: string | null; problem: string | null }
  office: { available: boolean; version: string | null }
  auth: { available: boolean }
}

let healthPromise: Promise<ServerHealth | null> | null = null
let healthAt = 0

/** Cached server capability check. Resolves to null when the server is not running. */
export function getHealth(force = false): Promise<ServerHealth | null> {
  if (!force && healthPromise && Date.now() - healthAt < 30_000) return healthPromise
  healthAt = Date.now()
  healthPromise = api<ServerHealth>('/api/health', { timeoutMs: 8000 }).catch(() => null)
  return healthPromise
}
