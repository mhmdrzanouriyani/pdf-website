import { useEffect, useState } from 'react'
import { closePdf, openWithPdfjs, type PDFDocumentProxy } from '../lib/pdf/pdfjs'
import { PdfPasswordError } from '../lib/pdf/core'
import { readBytes } from '../lib/files'
import { LIMITS } from '../config/limits'

export type PdfSource =
  | { status: 'empty' }
  | { status: 'loading'; file: File }
  | { status: 'password'; file: File; wrong: boolean }
  | { status: 'error'; file: File; error: string }
  | { status: 'ready'; file: File; bytes: Uint8Array; doc: PDFDocumentProxy; pageCount: number; password?: string }

/**
 * Opens a user PDF once with pdf.js (page count, thumbnails, text) and keeps
 * the raw bytes for pdf-lib operations. Handles password-protected files and
 * releases the pdf.js worker resources when the file changes.
 */
export function usePdfSource(file: File | null) {
  const [password, setPassword] = useState<string | undefined>(undefined)
  const [source, setSource] = useState<PdfSource>({ status: 'empty' })

  useEffect(() => {
    setPassword(undefined)
  }, [file])

  useEffect(() => {
    if (!file) {
      setSource({ status: 'empty' })
      return
    }
    let cancelled = false
    let doc: PDFDocumentProxy | null = null
    setSource({ status: 'loading', file })
    ;(async () => {
      try {
        const bytes = await readBytes(file)
        doc = await openWithPdfjs(bytes, password)
        if (cancelled) return
        if (doc.numPages > LIMITS.maxPages) {
          setSource({ status: 'error', file, error: `This PDF has ${doc.numPages} pages; the limit is ${LIMITS.maxPages}.` })
          return
        }
        setSource({ status: 'ready', file, bytes, doc, pageCount: doc.numPages, password })
      } catch (error) {
        if (cancelled) return
        if (error instanceof PdfPasswordError) setSource({ status: 'password', file, wrong: error.incorrect })
        else setSource({ status: 'error', file, error: error instanceof Error ? error.message : 'This PDF could not be opened.' })
      }
    })()
    return () => {
      cancelled = true
      void closePdf(doc)
    }
  }, [file, password])

  return { source, submitPassword: setPassword }
}
