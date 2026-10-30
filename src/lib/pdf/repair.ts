import { PDFDocument } from '@cantoo/pdf-lib'
import { PdfPasswordError, PdfProcessingError } from './core'
import { closePdf, openWithPdfjs } from './pdfjs'

export type RepairResult = {
  bytes: Uint8Array
  method: 'pdfjs-rebuild' | 'pdf-lib-lenient'
  pages: number
  notes: string[]
}

/**
 * Attempts to recover a malformed PDF.
 * 1. pdf.js reconstructs broken cross-reference tables and is very tolerant;
 *    its extractPages() writes a brand new, clean file from what it could read.
 * 2. Fallback: pdf-lib in lenient mode, which skips invalid objects.
 * The output is re-opened to verify it before it is offered for download.
 */
export async function repairPdf(bytes: Uint8Array, password?: string): Promise<RepairResult> {
  const notes: string[] = []

  try {
    const doc = await openWithPdfjs(bytes, password)
    try {
      const pages = doc.numPages
      const rebuilt = await doc.extractPages([{ document: null }])
      const check = await PDFDocument.load(rebuilt, { updateMetadata: false })
      if (check.getPageCount() > 0) {
        notes.push(`Rebuilt the file structure from ${pages} readable page${pages === 1 ? '' : 's'}.`)
        return { bytes: rebuilt, method: 'pdfjs-rebuild', pages: check.getPageCount(), notes }
      }
    } finally {
      await closePdf(doc)
    }
  } catch (error) {
    if (error instanceof PdfPasswordError) throw error
    notes.push('The tolerant parser could not rebuild the file.')
  }

  try {
    const doc = await PDFDocument.load(bytes, {
      throwOnInvalidObject: false,
      ignoreEncryption: false,
      updateMetadata: false,
      password,
    })
    const pages = doc.getPageCount()
    if (pages === 0) throw new Error('no pages')
    const out = await doc.save({ useObjectStreams: true })
    await PDFDocument.load(out)
    notes.push('Re-wrote the document, skipping objects that could not be parsed. Some content may be missing.')
    return { bytes: out, method: 'pdf-lib-lenient', pages, notes }
  } catch (error) {
    if (error instanceof Error && /password/i.test(error.message)) throw new PdfPasswordError(Boolean(password))
  }

  throw new PdfProcessingError(
    'PDFLY could not recover this file. It may be too badly damaged, truncated, or not a PDF at all.',
  )
}
