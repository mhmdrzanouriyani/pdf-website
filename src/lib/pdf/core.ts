import { PDFDocument, type PDFPage } from '@cantoo/pdf-lib'

export class PdfPasswordError extends Error {
  readonly incorrect: boolean
  constructor(incorrect: boolean) {
    super(
      incorrect
        ? 'The password is incorrect.'
        : 'This PDF is password-protected. Enter its password to continue.',
    )
    this.name = 'PdfPasswordError'
    this.incorrect = incorrect
  }
}

export class PdfProcessingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PdfProcessingError'
  }
}

export type LoadOptions = {
  password?: string
  /** Keep existing Producer/ModDate untouched (used by the metadata tool). */
  keepMetadata?: boolean
  /** Be lenient with malformed objects (used by repair). */
  lenient?: boolean
}

/**
 * Loads a PDF for modification. Encrypted documents require the password;
 * the resulting document is decrypted in memory and saved without encryption
 * unless the caller encrypts it again.
 */
export async function loadPdf(bytes: Uint8Array, options: LoadOptions = {}) {
  try {
    const probe = await PDFDocument.load(bytes, {
      ignoreEncryption: true,
      updateMetadata: false,
      throwOnInvalidObject: !options.lenient,
    })
    if (probe.isEncrypted) {
      if (options.password === undefined) {
        // Many "restricted" PDFs use an empty user password — try that first.
        try {
          return await PDFDocument.load(bytes, { password: '', updateMetadata: false })
        } catch {
          throw new PdfPasswordError(false)
        }
      }
      try {
        return await PDFDocument.load(bytes, {
          password: options.password,
          updateMetadata: false,
        })
      } catch (error) {
        if (error instanceof Error && /password/i.test(error.message)) throw new PdfPasswordError(true)
        throw error
      }
    }
    // Not encrypted: the probe is already a fully parsed document (one parse only).
    return probe
  } catch (error) {
    if (error instanceof PdfPasswordError) throw error
    throw new PdfProcessingError(describePdfError(error))
  }
}

export function describePdfError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/password/i.test(message)) return 'This PDF is password-protected.'
  if (/header|parse|invalid|unexpected|expected|xref|trailer/i.test(message)) {
    return 'This file could not be read as a PDF. It may be damaged — try the Repair PDF tool.'
  }
  return `The PDF could not be processed: ${message}`
}

export async function savePdf(doc: PDFDocument) {
  return doc.save({ useObjectStreams: true })
}

export function normalizeRotation(value: number) {
  return (((Math.round(value / 90) * 90) % 360) + 360) % 360
}

/**
 * Describes a page as the reader sees it (after /Rotate and the crop box) and
 * maps "visual" coordinates (origin bottom-left of the visible page) into PDF
 * user space. All stamping (watermarks, page numbers, edits, signatures) goes
 * through this so output lands where the user placed it, on rotated pages too.
 */
export function pageFrame(page: PDFPage) {
  const box = page.getCropBox()
  const rotation = normalizeRotation(page.getRotation().angle)
  const sideways = rotation === 90 || rotation === 270
  const width = sideways ? box.height : box.width
  const height = sideways ? box.width : box.height

  function toPdf(vx: number, vy: number) {
    switch (rotation) {
      case 90:
        return { x: box.x + box.width - vy, y: box.y + vx }
      case 180:
        return { x: box.x + box.width - vx, y: box.y + box.height - vy }
      case 270:
        return { x: box.x + vy, y: box.y + box.height - vx }
      default:
        return { x: box.x + vx, y: box.y + vy }
    }
  }

  return {
    width,
    height,
    rotation,
    toPdf,
    /** Converts a visual counter-clockwise angle into the angle to draw with in PDF space. */
    angle: (visualDegrees: number) => visualDegrees + rotation,
  }
}

/**
 * Origin for drawing a rotated box so that its centre lands on (cx, cy).
 * pdf-lib rotates text/images around their bottom-left origin.
 */
export function originForCentered(cx: number, cy: number, w: number, h: number, degreesCCW: number) {
  const r = (degreesCCW * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return {
    x: cx - (w / 2) * cos + (h / 2) * sin,
    y: cy - (w / 2) * sin - (h / 2) * cos,
  }
}

export function hexToRgb01(hex: string) {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  const value = match ? parseInt(match[1], 16) : 0
  return { r: ((value >> 16) & 255) / 255, g: ((value >> 8) & 255) / 255, b: (value & 255) / 255 }
}

/** True if the text can be drawn with the built-in (WinAnsi) PDF fonts. */
export function isWinAnsiText(text: string) {
  // WinAnsi covers Latin-1 plus a few typographic characters.
  const extras = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    if (code === 10 || code === 13) continue
    if (code >= 32 && code <= 126) continue
    if (code >= 160 && code <= 255) continue
    if (extras.includes(char)) continue
    return false
  }
  return true
}
