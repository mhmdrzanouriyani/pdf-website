import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.ts'

/**
 * Minimal file-backed store (JSON, atomic writes, serialized).
 * Suitable for a single server instance. For multi-instance production use,
 * replace this module with a real database — the routes only use the
 * functions exported here.
 */

export type Preferences = {
  responseLanguage: string
  summaryLength: 'short' | 'medium' | 'detailed'
  translateTo: string
}

export const DEFAULT_PREFERENCES: Preferences = { responseLanguage: 'auto', summaryLength: 'medium', translateTo: 'English' }

export type User = {
  id: string
  email: string
  name: string
  passwordHash: string
  createdAt: number
  preferences: Preferences
}

type Session = { tokenHash: string; userId: string; createdAt: number; expiresAt: number }
type ResetToken = { tokenHash: string; userId: string; expiresAt: number }
type Data = { users: User[]; sessions: Session[]; resets: ResetToken[] }

let data: Data | null = null
let writeChain: Promise<void> = Promise.resolve()

function file() {
  return path.join(config.auth.dataDir, 'auth.json')
}

async function load(): Promise<Data> {
  if (data) return data
  try {
    const raw = await fsp.readFile(file(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Data>
    data = { users: parsed.users ?? [], sessions: parsed.sessions ?? [], resets: parsed.resets ?? [] }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    data = { users: [], sessions: [], resets: [] }
  }
  return data
}

function persist() {
  const snapshot = JSON.stringify(data)
  writeChain = writeChain.then(async () => {
    await fsp.mkdir(config.auth.dataDir, { recursive: true, mode: 0o700 })
    const tmp = `${file()}.${process.pid}.tmp`
    await fsp.writeFile(tmp, snapshot, { mode: 0o600 })
    await fsp.rename(tmp, file())
  })
  return writeChain
}

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

export function newToken() {
  return crypto.randomBytes(32).toString('base64url')
}

// ---- passwords (scrypt, per-user salt, timing-safe compare) ----
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16)
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p }, (error, key) => {
      if (error) reject(error)
      else resolve(`scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`)
    })
  })
}

const DUMMY_HASH = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64')

export function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const parts = (stored ?? DUMMY_HASH).split('$')
  const [, n, r, p, saltB64, keyB64] = parts
  const expected = Buffer.from(keyB64 ?? '', 'base64')
  return new Promise((resolve) => {
    crypto.scrypt(password, Buffer.from(saltB64 ?? '', 'base64'), expected.length || 64, { N: Number(n), r: Number(r), p: Number(p) }, (error, key) => {
      if (error || !stored) return resolve(false)
      resolve(key.length === expected.length && crypto.timingSafeEqual(key, expected))
    })
  })
}

// ---- users ----
export async function findUserByEmail(email: string) {
  const db = await load()
  return db.users.find((user) => user.email === email.toLowerCase()) ?? null
}

export async function findUserById(id: string) {
  const db = await load()
  return db.users.find((user) => user.id === id) ?? null
}

export async function createUser(email: string, name: string, passwordHash: string) {
  const db = await load()
  const user: User = {
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    name,
    passwordHash,
    createdAt: Date.now(),
    preferences: { ...DEFAULT_PREFERENCES },
  }
  db.users.push(user)
  await persist()
  return user
}

export async function updateUser(id: string, patch: Partial<Pick<User, 'name' | 'passwordHash' | 'preferences'>>) {
  const db = await load()
  const user = db.users.find((u) => u.id === id)
  if (!user) return null
  Object.assign(user, patch)
  await persist()
  return user
}

export async function deleteUser(id: string) {
  const db = await load()
  db.users = db.users.filter((u) => u.id !== id)
  db.sessions = db.sessions.filter((s) => s.userId !== id)
  db.resets = db.resets.filter((r) => r.userId !== id)
  await persist()
}

// ---- sessions (only token hashes are stored) ----
export async function createSession(userId: string) {
  const db = await load()
  const token = newToken()
  const now = Date.now()
  db.sessions = db.sessions.filter((s) => s.expiresAt > now)
  db.sessions.push({ tokenHash: sha256(token), userId, createdAt: now, expiresAt: now + config.auth.sessionDays * 86_400_000 })
  await persist()
  return token
}

export async function userForSession(token: string | undefined) {
  if (!token) return null
  const db = await load()
  const hash = sha256(token)
  const session = db.sessions.find((s) => s.tokenHash === hash)
  if (!session || session.expiresAt <= Date.now()) return null
  return db.users.find((u) => u.id === session.userId) ?? null
}

export async function deleteSession(token: string | undefined) {
  if (!token) return
  const db = await load()
  const hash = sha256(token)
  db.sessions = db.sessions.filter((s) => s.tokenHash !== hash)
  await persist()
}

export async function deleteSessionsForUser(userId: string, exceptToken?: string) {
  const db = await load()
  const keep = exceptToken ? sha256(exceptToken) : null
  db.sessions = db.sessions.filter((s) => s.userId !== userId || s.tokenHash === keep)
  await persist()
}

// ---- password reset ----
export async function createResetToken(userId: string) {
  const db = await load()
  const token = newToken()
  const now = Date.now()
  db.resets = db.resets.filter((r) => r.expiresAt > now && r.userId !== userId)
  db.resets.push({ tokenHash: sha256(token), userId, expiresAt: now + 30 * 60_000 })
  await persist()
  return token
}

export async function consumeResetToken(token: string) {
  const db = await load()
  const hash = sha256(token)
  const entry = db.resets.find((r) => r.tokenHash === hash && r.expiresAt > Date.now())
  db.resets = db.resets.filter((r) => r.tokenHash !== hash)
  await persist()
  return entry?.userId ?? null
}

/** Test helper: start from an empty in-memory store. */
export function resetStoreForTests() {
  data = { users: [], sessions: [], resets: [] }
}

export function storeFileExists() {
  return fs.existsSync(file())
}
