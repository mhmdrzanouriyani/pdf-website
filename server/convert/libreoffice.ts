import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from '../config.ts'
import { createLimiter, HttpError } from '../lib/http.ts'

const CANDIDATES = [
  'soffice',
  'libreoffice',
  '/usr/bin/soffice',
  '/usr/lib/libreoffice/program/soffice',
  '/opt/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
]

type Detection = { available: boolean; path: string | null; version: string | null }
let detection: Detection | null = null

/** Finds a working LibreOffice binary once (LIBREOFFICE_PATH wins). */
export function detectLibreOffice(): Detection {
  if (detection) return detection
  const list = config.office.sofficePath ? [config.office.sofficePath] : CANDIDATES
  for (const candidate of list) {
    if (candidate.includes(path.sep) || candidate.includes('/')) {
      if (!fs.existsSync(candidate)) continue
    }
    try {
      const probe = spawnSync(candidate, ['--version'], { timeout: 20_000, encoding: 'utf8', windowsHide: true })
      if (probe.status === 0 && /LibreOffice/i.test(probe.stdout)) {
        detection = { available: true, path: candidate, version: probe.stdout.trim().split('\n')[0] }
        return detection
      }
    } catch {
      // try next candidate
    }
  }
  detection = { available: false, path: null, version: null }
  return detection
}

const limit = createLimiter(config.office.concurrency)

export type OfficeInput = 'docx' | 'pptx' | 'xlsx' | 'html'

/**
 * Converts one document to PDF in an isolated temp directory with its own
 * LibreOffice profile (so parallel jobs never share state). The user's file
 * name is never used on disk. Everything is deleted afterwards.
 */
export async function convertToPdf(input: Buffer, kind: OfficeInput): Promise<Buffer> {
  const office = detectLibreOffice()
  if (!office.available || !office.path) {
    throw new HttpError(503, 'office_unavailable', 'Office conversion is not available: LibreOffice is not installed on the server.')
  }
  return limit(async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdfly-'))
    try {
      const source = path.join(dir, `input.${kind}`)
      const outDir = path.join(dir, 'out')
      const profile = path.join(dir, 'profile')
      await fsp.mkdir(outDir)
      await fsp.writeFile(source, input, { mode: 0o600 })
      const filter = kind === 'html' ? 'pdf:writer_web_pdf_Export' : 'pdf'
      await run(office.path!, [
        `-env:UserInstallation=${pathToFileURL(profile).href}`,
        '--headless',
        '--norestore',
        '--nolockcheck',
        '--nodefault',
        '--nofirststartwizard',
        '--convert-to',
        filter,
        '--outdir',
        outDir,
        source,
      ])
      const output = path.join(outDir, 'input.pdf')
      if (!fs.existsSync(output)) {
        throw new HttpError(422, 'convert_failed', 'LibreOffice could not convert this file. It may be damaged, password-protected or unsupported.')
      }
      const pdf = await fsp.readFile(output)
      if (pdf.length < 64 || pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new HttpError(422, 'convert_failed', 'The conversion produced an invalid PDF.')
      }
      return pdf
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined)
    }
  })
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      env: { ...process.env, HOME: os.tmpdir() },
    })
    let stderr = ''
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 4000) stderr += chunk.toString()
    })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new HttpError(504, 'convert_timeout', 'The conversion took too long and was stopped. Try a smaller file.'))
    }, config.office.timeoutMs)
    child.on('error', () => {
      clearTimeout(timer)
      reject(new HttpError(503, 'office_unavailable', 'LibreOffice could not be started on the server.'))
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else {
        console.warn('[pdfly] soffice exited with', code, stderr.slice(0, 500))
        reject(new HttpError(422, 'convert_failed', 'LibreOffice could not convert this file. It may be damaged or unsupported.'))
      }
    })
  })
}
