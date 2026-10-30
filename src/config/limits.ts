/**
 * Processing limits used by validation across the app.
 * Override at build time with VITE_* environment variables (see .env.example).
 * Plan definitions reference these values instead of hardcoding numbers.
 */
function num(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const env = import.meta.env ?? {}

export const LIMITS = {
  /** Max size of a single file processed in the browser. */
  maxFileBytes: num(env.VITE_MAX_FILE_MB, 100) * 1024 * 1024,
  /** Max size for files sent to the server (office conversion). Must not exceed the server's limit. */
  maxServerFileBytes: num(env.VITE_MAX_SERVER_FILE_MB, 25) * 1024 * 1024,
  /** Max number of files per tool run (merge, images → PDF …). */
  maxFiles: num(env.VITE_MAX_FILES, 40),
  /** Max pages a single document may have for page operations. */
  maxPages: num(env.VITE_MAX_PAGES, 2000),
  /** Max pages rasterised in one run (PDF → images, OCR, redaction). */
  maxRasterPages: num(env.VITE_MAX_RASTER_PAGES, 200),
  /** Max pages processed by OCR in one run. */
  maxOcrPages: num(env.VITE_MAX_OCR_PAGES, 60),
  /** Recent documents kept in this browser (IndexedDB). */
  maxStoredDocuments: num(env.VITE_MAX_STORED_DOCS, 25),
  maxStoredBytes: num(env.VITE_MAX_STORED_MB, 600) * 1024 * 1024,
} as const

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}
