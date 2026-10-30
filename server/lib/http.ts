import type { NextFunction, Request, Response } from 'express'

/** Error with a message that is safe to show to users. Anything else becomes a generic 500. */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

/** Final error handler: never leaks stack traces or filesystem paths. */
export function errorHandler(error: unknown, _req: Request, res: Response, next: NextFunction) {
  void next
  if (res.headersSent) return
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } })
    return
  }
  const anyError = error as { type?: string; code?: string; status?: number }
  if (anyError?.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'too_large', message: 'The request is too large.' } })
    return
  }
  if (anyError?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'bad_json', message: 'The request body is not valid JSON.' } })
    return
  }
  if (anyError?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: { code: 'too_large', message: 'The file is larger than the server allows.' } })
    return
  }
  console.error('[pdfly] unhandled error:', error instanceof Error ? error.message : error)
  res.status(500).json({ error: { code: 'internal', message: 'Something went wrong on the server. Please try again.' } })
}

type Bucket = { count: number; resetAt: number }

/** Small in-memory fixed-window rate limiter keyed by client IP (single-instance deployments). */
export function rateLimit(name: string, options: { windowMs: number; max: number }) {
  const buckets = new Map<string, Bucket>()
  setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key)
  }, options.windowMs).unref()

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${name}:${req.ip ?? 'unknown'}`
    const now = Date.now()
    let bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs }
      buckets.set(key, bucket)
    }
    bucket.count += 1
    res.setHeader('RateLimit-Limit', String(options.max))
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - bucket.count)))
    if (bucket.count > options.max) {
      const retry = Math.ceil((bucket.resetAt - now) / 1000)
      res.setHeader('Retry-After', String(retry))
      next(new HttpError(429, 'rate_limited', `Too many requests. Please wait ${retry} seconds and try again.`))
      return
    }
    next()
  }
}

/** Simple async semaphore to cap concurrent heavy jobs (LibreOffice). */
export function createLimiter(concurrency: number) {
  let active = 0
  const queue: (() => void)[] = []
  return async function run<T>(job: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      if (queue.length > 20) throw new HttpError(503, 'busy', 'The server is busy. Please try again in a minute.')
      await new Promise<void>((resolve) => queue.push(resolve))
    }
    active += 1
    try {
      return await job()
    } finally {
      active -= 1
      queue.shift()?.()
    }
  }
}
