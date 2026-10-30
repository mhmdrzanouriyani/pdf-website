import fs from 'node:fs'
import path from 'node:path'

// Load .env (Node ≥ 20.12 has a built-in loader). Real environment variables win.
for (const file of ['.env.local', '.env']) {
  const full = path.resolve(file)
  if (fs.existsSync(full)) {
    try {
      process.loadEnvFile(full)
    } catch {
      // Ignore malformed files; the health endpoint will report missing config.
    }
  }
}

function num(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function str(name: string, fallback = '') {
  return (process.env[name] ?? fallback).trim()
}

export type AIProviderName = 'anthropic' | 'openai' | 'none'

function detectProvider(): AIProviderName {
  const explicit = str('AI_PROVIDER').toLowerCase()
  if (explicit === 'anthropic' || explicit === 'openai') return explicit
  if (explicit === 'none' || explicit === 'off') return 'none'
  if (str('ANTHROPIC_API_KEY')) return 'anthropic'
  if (str('OPENAI_API_KEY') || str('OPENAI_BASE_URL')) return 'openai'
  return 'none'
}

const provider = detectProvider()

export const config = {
  port: num('PORT', num('PDFLY_API_PORT', 8787)),
  host: str('HOST', '127.0.0.1'),
  isProduction: process.env.NODE_ENV === 'production' || process.argv.includes('--production'),
  /** Origins allowed to call the API from a browser (comma separated). Same-origin always works. */
  allowedOrigins: str('ALLOWED_ORIGINS', 'http://127.0.0.1:5173,http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  ai: {
    provider,
    anthropicKey: str('ANTHROPIC_API_KEY'),
    openaiKey: str('OPENAI_API_KEY'),
    openaiBaseUrl: str('OPENAI_BASE_URL', 'https://api.openai.com/v1').replace(/\/+$/, ''),
    model:
      str('AI_MODEL') || (provider === 'anthropic' ? 'claude-sonnet-5-5' : provider === 'openai' ? '' : ''),
    timeoutMs: num('AI_TIMEOUT_MS', 90_000),
    maxOutputTokens: num('AI_MAX_OUTPUT_TOKENS', 2048),
    /** Total characters of document context accepted per request. */
    maxContextChars: num('AI_MAX_CONTEXT_CHARS', 120_000),
    rateLimit: { windowMs: num('AI_RATE_WINDOW_MS', 5 * 60_000), max: num('AI_RATE_MAX', 40) },
  },

  office: {
    sofficePath: str('LIBREOFFICE_PATH'),
    timeoutMs: num('CONVERT_TIMEOUT_MS', 120_000),
    maxFileBytes: num('CONVERT_MAX_FILE_MB', 25) * 1024 * 1024,
    concurrency: num('CONVERT_CONCURRENCY', 2),
    rateLimit: { windowMs: num('CONVERT_RATE_WINDOW_MS', 5 * 60_000), max: num('CONVERT_RATE_MAX', 20) },
  },

  auth: {
    dataDir: path.resolve(str('PDFLY_DATA_DIR', 'server-data')),
    sessionDays: num('SESSION_DAYS', 14),
    rateLimit: { windowMs: num('AUTH_RATE_WINDOW_MS', 15 * 60_000), max: num('AUTH_RATE_MAX', 20) },
    /** Base URL used in password reset links. */
    publicUrl: str('PUBLIC_URL', 'http://127.0.0.1:5173').replace(/\/+$/, ''),
  },
}

export function aiConfigured() {
  const ai = config.ai
  if (ai.provider === 'anthropic') return Boolean(ai.anthropicKey && ai.model)
  if (ai.provider === 'openai') return Boolean(ai.model && (ai.openaiKey || !ai.openaiBaseUrl.includes('api.openai.com')))
  return false
}

export function aiConfigProblem() {
  const ai = config.ai
  if (ai.provider === 'none') return 'No AI provider is configured. Set ANTHROPIC_API_KEY (or OPENAI_API_KEY / OPENAI_BASE_URL) in .env and restart the server.'
  if (ai.provider === 'anthropic' && !ai.anthropicKey) return 'AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is empty.'
  if (ai.provider === 'openai' && !ai.model) return 'Set AI_MODEL for the OpenAI-compatible provider (for example the model name served by your endpoint).'
  if (ai.provider === 'openai' && !ai.openaiKey && ai.openaiBaseUrl.includes('api.openai.com')) return 'OPENAI_API_KEY is empty.'
  return null
}
