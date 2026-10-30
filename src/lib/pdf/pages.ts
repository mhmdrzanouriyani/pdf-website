import { PDFDocument, degrees } from '@cantoo/pdf-lib'
import { loadPdf, normalizeRotation, pageFrame, PdfProcessingError, savePdf } from './core'
import type { PageRange } from '../pageRanges'

export type PdfInput = { bytes: Uint8Array; password?: string }

/** Joins documents in the given order. Every page of every input is copied. */
export async function mergePdfs(inputs: PdfInput[]) {
  if (inputs.length < 2) throw new PdfProcessingError('Add at least two PDF files to merge.')
  const out = await PDFDocument.create()
  for (const input of inputs) {
    const src = await loadPdf(input.bytes, { password: input.password })
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((page) => out.addPage(page))
  }
  return savePdf(out)
}

/** Builds a new PDF from the given 0-based page indices of the source (order kept, duplicates allowed). */
export async function pickPages(bytes: Uint8Array, indices: number[], password?: string) {
  const src = await loadPdf(bytes, { password })
  return pickFromDoc(src, indices)
}

async function pickFromDoc(src: PDFDocument, indices: number[]) {
  const count = src.getPageCount()
  if (indices.length === 0) throw new PdfProcessingError('Select at least one page.')
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      throw new PdfProcessingError(`Page ${index + 1} does not exist — the document has ${count} pages.`)
    }
  }
  const out = await PDFDocument.create()
  const pages = await out.copyPages(src, indices)
  pages.forEach((page) => out.addPage(page))
  copyInfo(src, out)
  return savePdf(out)
}

export const extractPages = pickPages

export async function removePages(bytes: Uint8Array, indices: number[], password?: string) {
  const src = await loadPdf(bytes, { password })
  const count = src.getPageCount()
  const remove = new Set(indices)
  const keep = src.getPageIndices().filter((index) => !remove.has(index))
  if (remove.size === 0) throw new PdfProcessingError('Select the pages you want to remove.')
  if (keep.length === 0) throw new PdfProcessingError(`You selected all ${count} pages. A PDF needs at least one page.`)
  return pickFromDoc(src, keep)
}

/** One output document per range. */
export async function splitByRanges(bytes: Uint8Array, ranges: PageRange[], password?: string) {
  const src = await loadPdf(bytes, { password })
  return splitDoc(src, ranges)
}

async function splitDoc(src: PDFDocument, ranges: PageRange[]) {
  if (ranges.length === 0) throw new PdfProcessingError('Add at least one range.')
  const outputs: { label: string; bytes: Uint8Array }[] = []
  for (const range of ranges) {
    const indices = Array.from({ length: range.end - range.start + 1 }, (_, i) => range.start - 1 + i)
    outputs.push({
      label: range.start === range.end ? `page-${range.start}` : `pages-${range.start}-${range.end}`,
      bytes: await pickFromDoc(src, indices),
    })
  }
  return outputs
}

/** Splits into chunks of `size` pages (size 1 = every page separately). */
export async function splitEvery(bytes: Uint8Array, size: number, password?: string) {
  const src = await loadPdf(bytes, { password })
  const count = src.getPageCount()
  const chunk = Math.max(1, Math.floor(size))
  const ranges: PageRange[] = []
  for (let start = 1; start <= count; start += chunk) {
    ranges.push({ start, end: Math.min(count, start + chunk - 1) })
  }
  return splitDoc(src, ranges)
}

/** Adds `delta` degrees (multiple of 90) to the given pages, or all pages when indices is null. */
export async function rotatePages(bytes: Uint8Array, delta: number, indices: number[] | null, password?: string) {
  if (normalizeRotation(delta) === 0) throw new PdfProcessingError('Choose a rotation of 90°, 180° or 270°.')
  const doc = await loadPdf(bytes, { password })
  const targets = indices ?? doc.getPageIndices()
  if (targets.length === 0) throw new PdfProcessingError('Select at least one page to rotate.')
  for (const index of targets) {
    const page = doc.getPage(index)
    page.setRotation(degrees(normalizeRotation(page.getRotation().angle + delta)))
  }
  return savePdf(doc)
}

export type OrganizeItem = {
  /** 0-based index in the source document. The same source may appear several times (duplicate). */
  source: number
  /** Extra rotation applied on top of the page's own rotation. */
  rotation: number
}

/** Rebuilds the document in the given order with per-page rotation; omitted pages are deleted. */
export async function organizePages(bytes: Uint8Array, plan: OrganizeItem[], password?: string) {
  if (plan.length === 0) throw new PdfProcessingError('The result would have no pages.')
  const src = await loadPdf(bytes, { password })
  const out = await PDFDocument.create()
  const copied = await out.copyPages(
    src,
    plan.map((item) => item.source),
  )
  copied.forEach((page, i) => {
    const extra = plan[i].rotation
    if (extra) page.setRotation(degrees(normalizeRotation(page.getRotation().angle + extra)))
    out.addPage(page)
  })
  copyInfo(src, out)
  return savePdf(out)
}

export type CropMargins = { top: number; right: number; bottom: number; left: number }

/**
 * Crops pages by the given margins (in PDF points, measured on the page as displayed).
 * Writes a real CropBox and MediaBox into the output — not a visual overlay.
 */
export async function cropPages(bytes: Uint8Array, margins: CropMargins, indices: number[] | null, password?: string) {
  const doc = await loadPdf(bytes, { password })
  const targets = indices ?? doc.getPageIndices()
  if (targets.length === 0) throw new PdfProcessingError('Select at least one page to crop.')
  for (const index of targets) {
    const page = doc.getPage(index)
    const frame = pageFrame(page)
    const left = Math.max(0, margins.left)
    const right = Math.max(0, margins.right)
    const top = Math.max(0, margins.top)
    const bottom = Math.max(0, margins.bottom)
    if (left + right >= frame.width - 10 || top + bottom >= frame.height - 10) {
      throw new PdfProcessingError(`The margins are larger than page ${index + 1}.`)
    }
    const a = frame.toPdf(left, bottom)
    const b = frame.toPdf(frame.width - right, frame.height - top)
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(a.x - b.x)
    const h = Math.abs(a.y - b.y)
    page.setMediaBox(x, y, w, h)
    page.setCropBox(x, y, w, h)
  }
  return savePdf(doc)
}

function copyInfo(src: PDFDocument, out: PDFDocument) {
  const title = src.getTitle()
  const author = src.getAuthor()
  if (title) out.setTitle(title)
  if (author) out.setAuthor(author)
}

export async function getPageCount(bytes: Uint8Array, password?: string) {
  const doc = await loadPdf(bytes, { password })
  return doc.getPageCount()
}
