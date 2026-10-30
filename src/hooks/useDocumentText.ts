import { useEffect, useState } from 'react'
import type { PDFDocumentProxy } from '../lib/pdf/pdfjs'
import type { PageText } from '../lib/ai/retrieval'

type TextState =
  | { status: 'idle'; pages: null; done: 0; total: 0 }
  | { status: 'extracting'; pages: null; done: number; total: number }
  | { status: 'ready'; pages: PageText[]; done: number; total: number }
  | { status: 'error'; pages: null; done: number; total: number; error: string }

// Extracted text is cached per document key for the session so switching back is instant.
const cache = new Map<string, PageText[]>()

export function useDocumentText(docKey: string | null, doc: PDFDocumentProxy | null): TextState {
  const [state, setState] = useState<TextState>({ status: 'idle', pages: null, done: 0, total: 0 })

  useEffect(() => {
    if (!docKey || !doc) {
      setState({ status: 'idle', pages: null, done: 0, total: 0 })
      return
    }
    const cached = cache.get(docKey)
    if (cached) {
      setState({ status: 'ready', pages: cached, done: cached.length, total: cached.length })
      return
    }
    const controller = new AbortController()
    setState({ status: 'extracting', pages: null, done: 0, total: doc.numPages })
    import('../lib/pdf/pdfjs')
      .then(({ extractText }) =>
        extractText(
          doc,
          (done, total) => {
            if (!controller.signal.aborted) setState({ status: 'extracting', pages: null, done, total })
          },
          controller.signal,
        ),
      )
      .then((pages) => {
        if (controller.signal.aborted) return
        cache.set(docKey, pages)
        setState({ status: 'ready', pages, done: pages.length, total: pages.length })
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', pages: null, done: 0, total: 0, error: error instanceof Error ? error.message : 'Could not read the text.' })
      })
    return () => controller.abort()
  }, [docKey, doc])

  return state
}

export function forgetDocumentText(docKey: string) {
  cache.delete(docKey)
}
