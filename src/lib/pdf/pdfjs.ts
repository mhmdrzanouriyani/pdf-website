// The legacy build includes polyfills (e.g. Map.getOrInsertComputed) that the modern
// build assumes; without them pdf.js v6 fails in many current browsers.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { PdfPasswordError, PdfProcessingError } from './core'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const assetBase = `${import.meta.env.BASE_URL}pdfjs/`

export const PDFJS_DOC_OPTIONS = {
  cMapUrl: `${assetBase}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${assetBase}standard_fonts/`,
  wasmUrl: `${assetBase}wasm/`,
  iccUrl: `${assetBase}iccs/`,
  // Never let a PDF trigger network requests or run embedded scripts.
  isEvalSupported: false,
  enableXfa: false,
  disableAutoFetch: true,
}

export { pdfjs }
export type { PDFDocumentProxy, PDFPageProxy }

/**
 * Opens a PDF with pdf.js. The bytes are copied because pdf.js transfers
 * (detaches) the buffer it is given to its worker.
 */
export async function openWithPdfjs(bytes: Uint8Array, password?: string): Promise<PDFDocumentProxy> {
  const task = pdfjs.getDocument({ ...PDFJS_DOC_OPTIONS, data: bytes.slice(), password })
  try {
    return await task.promise
  } catch (error) {
    await task.destroy().catch(() => undefined)
    throw translatePdfjsError(error)
  }
}

export function translatePdfjsError(error: unknown): Error {
  if (error instanceof pdfjs.PasswordException) {
    return new PdfPasswordError(error.code === pdfjs.PasswordResponses.INCORRECT_PASSWORD)
  }
  if (error instanceof pdfjs.InvalidPDFException) {
    return new PdfProcessingError('This file is not a valid PDF or is too damaged to open. Try the Repair PDF tool.')
  }
  if (error instanceof Error && /memory|allocation/i.test(error.message)) {
    return new PdfProcessingError('Your browser ran out of memory while opening this PDF. Try a smaller file.')
  }
  return error instanceof Error ? error : new PdfProcessingError(String(error))
}

/** Destroys a document and its worker resources (pdf.js v6 moved destroy() to the loading task). */
export function closePdf(doc: PDFDocumentProxy | null | undefined) {
  if (!doc) return Promise.resolve()
  return doc.loadingTask.destroy().catch(() => undefined)
}

export type CanvasRender = { canvas: HTMLCanvasElement; width: number; height: number }

/** Renders one page into a new canvas at the given scale (1 = 72 dpi). */
export async function renderPageToCanvas(
  page: PDFPageProxy,
  scale: number,
  options: { rotation?: number; background?: string; signal?: AbortSignal } = {},
): Promise<CanvasRender> {
  const viewport = page.getViewport({ scale, rotation: (page.rotate + (options.rotation ?? 0)) % 360 })
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new PdfProcessingError('Your browser could not create a drawing canvas. It may be out of memory.')
  context.fillStyle = options.background ?? '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const task = page.render({ canvas, canvasContext: context, viewport })
  const onAbort = () => task.cancel()
  options.signal?.addEventListener('abort', onAbort)
  try {
    await task.promise
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }
  return { canvas, width: canvas.width, height: canvas.height }
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: 'image/jpeg' | 'image/png', quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new PdfProcessingError('The image could not be encoded. The page may be too large.'))),
      type,
      quality,
    )
  })
}

/** Releases canvas memory immediately (browsers keep the backing store until GC otherwise). */
export function releaseCanvas(canvas: HTMLCanvasElement) {
  canvas.width = 0
  canvas.height = 0
}

/** Largest scale that keeps the canvas under a pixel budget (protects browser memory). */
export function safeScale(page: PDFPageProxy, desired: number, maxPixels = 16_000_000) {
  const base = page.getViewport({ scale: 1 })
  const pixels = base.width * base.height * desired * desired
  return pixels > maxPixels ? Math.sqrt(maxPixels / (base.width * base.height)) : desired
}

export type PageText = { page: number; text: string }

type TextItemLike = { str: string; transform: number[]; hasEOL?: boolean; height?: number; width?: number }

/**
 * Extracts text per page with basic reading order: items are grouped into lines
 * by baseline and lines separated by larger gaps become paragraphs.
 */
export async function extractText(
  doc: PDFDocumentProxy,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<PageText[]> {
  const pages: PageText[] = []
  for (let n = 1; n <= doc.numPages; n += 1) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    pages.push({ page: n, text: itemsToText(content.items as TextItemLike[]) })
    page.cleanup()
    onProgress?.(n, doc.numPages)
  }
  return pages
}

export function itemsToText(items: TextItemLike[]) {
  const lines: { y: number; x: number; h: number; parts: string[] }[] = []
  let current: { y: number; x: number; h: number; parts: string[] } | null = null
  for (const item of items) {
    if (typeof item.str !== 'string') continue
    const y = item.transform[5]
    const x = item.transform[4]
    const h = Math.abs(item.height ?? item.transform[3]) || 10
    if (!current || Math.abs(current.y - y) > h * 0.5) {
      current = { y, x, h, parts: [] }
      lines.push(current)
    }
    current.parts.push(item.str)
    if (item.hasEOL) current = null
  }
  const out: string[] = []
  let previous: (typeof lines)[number] | null = null
  for (const line of lines) {
    const text = line.parts.join('').replace(/\s+/g, ' ').trim()
    if (!text) {
      previous = line
      continue
    }
    if (previous && Math.abs(previous.y - line.y) > Math.max(previous.h, line.h) * 1.8 && out.length) out.push('')
    out.push(text)
    previous = line
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
