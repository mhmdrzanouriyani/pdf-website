import express, { type NextFunction, type Request, type Response } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { aiConfigProblem, config } from './config.ts'
import { getProvider } from './ai/providers.ts'
import { detectLibreOffice } from './convert/libreoffice.ts'
import { aiRouter } from './routes/ai.ts'
import { convertRouter } from './routes/convert.ts'
import { authRouter } from './routes/auth.ts'
import { errorHandler, HttpError } from './lib/http.ts'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false)

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
    next()
  })

  // CSRF defence for cookie-authenticated requests: state-changing calls must
  // come from our own origin (or an explicitly allowed one).
  app.use('/api', (req: Request, _res: Response, next: NextFunction) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next()
    const origin = req.get('origin')
    if (!origin) return next() // non-browser clients (curl, tests) send no Origin
    const host = req.get('host')
    let sameHost = false
    try {
      sameHost = new URL(origin).host === host
    } catch {
      sameHost = false
    }
    if (sameHost || config.allowedOrigins.includes(origin)) return next()
    next(new HttpError(403, 'bad_origin', 'Cross-origin request blocked.'))
  })

  app.use('/api', express.json({ limit: '2mb' }))

  app.get('/api/health', (_req, res) => {
    const provider = getProvider()
    const office = detectLibreOffice()
    res.json({
      ok: true,
      ai: { configured: Boolean(provider), provider: provider?.name ?? null, model: provider?.model ?? null, problem: provider ? null : aiConfigProblem() },
      office: { available: office.available, version: office.version },
      auth: { available: true },
    })
  })

  app.use('/api/ai', aiRouter)
  app.use('/api/convert', convertRouter)
  app.use('/api/auth', authRouter)
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found', 'Unknown API endpoint.')))

  // In production, serve the built frontend with an SPA fallback.
  const dist = path.resolve('dist')
  if (config.isProduction && fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(
      express.static(dist, {
        index: false,
        setHeaders: (res, file) => {
          if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        },
      }),
    )
    app.get(/^(?!\/api\/).*/, (_req, res) => {
      res.setHeader(
        'Content-Security-Policy',
        [
          "default-src 'self'",
          "script-src 'self' 'wasm-unsafe-eval'",
          "worker-src 'self' blob:",
          "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
          "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
          "img-src 'self' data: blob:",
          "connect-src 'self' https://cdn.jsdelivr.net",
          "frame-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
        ].join('; '),
      )
      res.sendFile(path.join(dist, 'index.html'))
    })
  }

  app.use(errorHandler)
  return app
}

const isEntry = process.argv[1] && path.resolve(process.argv[1]).replace(/\.[jt]s$/, '') === path.resolve('server/index').replace(/\.[jt]s$/, '')

if (isEntry) {
  const app = createApp()
  app.listen(config.port, config.host, () => {
    const provider = getProvider()
    const office = detectLibreOffice()
    console.log(`[pdfly] API listening on http://${config.host}:${config.port}`)
    console.log(`[pdfly] AI: ${provider ? `${provider.name} (${provider.model})` : `not configured — ${aiConfigProblem()}`}`)
    console.log(`[pdfly] Office conversion: ${office.available ? office.version : 'LibreOffice not found (set LIBREOFFICE_PATH)'}`)
  })
}
