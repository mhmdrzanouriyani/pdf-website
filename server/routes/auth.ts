import { Router, type Request, type Response } from 'express'
import { config } from '../config.ts'
import { asyncHandler, HttpError, rateLimit } from '../lib/http.ts'
import {
  consumeResetToken,
  createResetToken,
  createSession,
  createUser,
  DEFAULT_PREFERENCES,
  deleteSession,
  deleteSessionsForUser,
  deleteUser,
  findUserByEmail,
  hashPassword,
  updateUser,
  userForSession,
  verifyPassword,
  type Preferences,
  type User,
} from '../auth/store.ts'

export const authRouter = Router()
const COOKIE = 'pdfly_session'
const limiter = rateLimit('auth', config.auth.rateLimit)
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/

function readCookie(req: Request, name: string) {
  const header = req.headers.cookie
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

function setSessionCookie(res: Response, token: string) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/',
    maxAge: config.auth.sessionDays * 86_400_000,
  })
}

function publicUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, preferences: user.preferences }
}

function validatePassword(password: unknown) {
  if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'weak_password', 'Use a password with at least 8 characters.')
  if (password.length > 200) throw new HttpError(400, 'weak_password', 'That password is too long.')
  if (/^(.)\1+$/.test(password) || /^(password|12345678|qwertyui)/i.test(password)) {
    throw new HttpError(400, 'weak_password', 'That password is too easy to guess.')
  }
  return password
}

function validateEmail(email: unknown) {
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) throw new HttpError(400, 'invalid_email', 'Enter a valid email address.')
  return email.trim().toLowerCase()
}

async function requireUser(req: Request) {
  const user = await userForSession(readCookie(req, COOKIE))
  if (!user) throw new HttpError(401, 'unauthenticated', 'Please log in.')
  return user
}

authRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await userForSession(readCookie(req, COOKIE))
    res.setHeader('Cache-Control', 'no-store')
    res.json({ user: user ? publicUser(user) : null })
  }),
)

authRouter.post(
  '/register',
  limiter,
  asyncHandler(async (req, res) => {
    const email = validateEmail(req.body?.email)
    const password = validatePassword(req.body?.password)
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 80) : ''
    if (await findUserByEmail(email)) throw new HttpError(409, 'exists', 'An account with this email already exists. Log in instead.')
    const user = await createUser(email, name, await hashPassword(password))
    setSessionCookie(res, await createSession(user.id))
    res.status(201).json({ user: publicUser(user) })
  }),
)

authRouter.post(
  '/login',
  limiter,
  asyncHandler(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    const user = email ? await findUserByEmail(email) : null
    // Always run a hash comparison so response time doesn't reveal whether the account exists.
    const ok = await verifyPassword(password, user?.passwordHash)
    if (!user || !ok) throw new HttpError(401, 'bad_credentials', 'The email or password is incorrect.')
    setSessionCookie(res, await createSession(user.id))
    res.json({ user: publicUser(user) })
  }),
)

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await deleteSession(readCookie(req, COOKIE))
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  }),
)

authRouter.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await requireUser(req)
    const patch: Partial<Pick<User, 'name' | 'preferences'>> = {}
    if (typeof req.body?.name === 'string') patch.name = req.body.name.trim().slice(0, 80)
    const prefs = req.body?.preferences
    if (prefs && typeof prefs === 'object') {
      const next: Preferences = { ...DEFAULT_PREFERENCES, ...user.preferences }
      if (typeof prefs.responseLanguage === 'string') next.responseLanguage = prefs.responseLanguage.slice(0, 40)
      if (['short', 'medium', 'detailed'].includes(prefs.summaryLength)) next.summaryLength = prefs.summaryLength
      if (typeof prefs.translateTo === 'string') next.translateTo = prefs.translateTo.slice(0, 40)
      patch.preferences = next
    }
    const updated = await updateUser(user.id, patch)
    res.json({ user: publicUser(updated!) })
  }),
)

authRouter.post(
  '/password',
  limiter,
  asyncHandler(async (req, res) => {
    const user = await requireUser(req)
    const current = typeof req.body?.current === 'string' ? req.body.current : ''
    if (!(await verifyPassword(current, user.passwordHash))) throw new HttpError(401, 'bad_credentials', 'Your current password is incorrect.')
    const next = validatePassword(req.body?.next)
    await updateUser(user.id, { passwordHash: await hashPassword(next) })
    await deleteSessionsForUser(user.id, readCookie(req, COOKIE))
    res.json({ ok: true })
  }),
)

authRouter.delete(
  '/me',
  limiter,
  asyncHandler(async (req, res) => {
    const user = await requireUser(req)
    const password = typeof req.body?.password === 'string' ? req.body.password : ''
    if (!(await verifyPassword(password, user.passwordHash))) throw new HttpError(401, 'bad_credentials', 'The password is incorrect.')
    await deleteUser(user.id)
    res.clearCookie(COOKIE, { path: '/' })
    res.json({ ok: true })
  }),
)

authRouter.post(
  '/forgot',
  limiter,
  asyncHandler(async (req, res) => {
    const email = validateEmail(req.body?.email)
    const user = await findUserByEmail(email)
    let delivery: 'console' | 'none' = 'none'
    if (user) {
      const token = await createResetToken(user.id)
      const link = `${config.auth.publicUrl}/reset-password?token=${token}`
      if (!config.isProduction) {
        // No email service is configured. In development the link is printed to the server console.
        console.log(`[pdfly] Password reset link for ${email}: ${link}`)
        delivery = 'console'
      }
    }
    // Same response whether or not the account exists (prevents account enumeration).
    res.json({
      ok: true,
      emailConfigured: false,
      devConsole: !config.isProduction ? true : delivery === 'console',
    })
  }),
)

authRouter.post(
  '/reset',
  limiter,
  asyncHandler(async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token : ''
    const password = validatePassword(req.body?.password)
    const userId = token ? await consumeResetToken(token) : null
    if (!userId) throw new HttpError(400, 'bad_token', 'This reset link is invalid or has expired. Request a new one.')
    await updateUser(userId, { passwordHash: await hashPassword(password) })
    await deleteSessionsForUser(userId)
    res.json({ ok: true })
  }),
)
