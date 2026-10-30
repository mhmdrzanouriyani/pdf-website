import { PDFDocument, degrees } from '@cantoo/pdf-lib'
import { loadPdf, originForCentered, pageFrame, PdfProcessingError } from './core'
import { releaseCanvas, renderPageToCanvas, safeScale, type PDFDocumentProxy } from './pdfjs'

export const OCR_LANGUAGES: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'fas', label: 'Persian (فارسی)' },
  { code: 'tur', label: 'Turkish' },
  { code: 'deu', label: 'German' },
  { code: 'fra', label: 'French' },
  { code: 'spa', label: 'Spanish' },
  { code: 'ita', label: 'Italian' },
  { code: 'por', label: 'Portuguese' },
  { code: 'ara', label: 'Arabic' },
  { code: 'rus', label: 'Russian' },
  { code: 'chi_sim', label: 'Chinese (Simplified)' },
  { code: 'jpn', label: 'Japanese' },
]

export type OcrProgress = { page: number; pages: number; fraction: number; stage: string }

export type OcrResult = {
  pdf: Uint8Array
  text: string
  processedPages: number
  skippedPages: number
  meanConfidence: number | null
}

/**
 * Runs Tesseract (WebAssembly) on each page image in the browser, then lays the
 * recognised words as an invisible text layer over the ORIGINAL pages, so the
 * output keeps the original quality and becomes searchable/selectable.
 */
export async function ocrPdf(
  bytes: Uint8Array,
  doc: PDFDocumentProxy,
  options: {
    languages: string[]
    pages: number[]
    skipTextPages: boolean
    password?: string
    signal?: AbortSignal
    onProgress?: (progress: OcrProgress) => void
  },
): Promise<OcrResult> {
  const { createWorker } = await import('tesseract.js')
  let current = { page: 0, pages: options.pages.length, fraction: 0, stage: 'Loading OCR engine…' }
  options.onProgress?.(current)
  const base = `${import.meta.env.BASE_URL}tesseract/`
  let worker: Awaited<ReturnType<typeof createWorker>>
  try {
    worker = await createWorker(options.languages.join('+'), 1, {
      // Engine files are self-hosted; language data comes from VITE_OCR_LANG_PATH or the tesseract.js CDN.
      workerPath: `${base}worker.min.js`,
      corePath: base,
      ...(import.meta.env.VITE_OCR_LANG_PATH ? { langPath: import.meta.env.VITE_OCR_LANG_PATH } : {}),
      errorHandler: () => undefined,
      logger: (message: { status: string; progress: number }) => {
        const stage = message.status === 'recognizing text' ? 'Recognising text' : message.status.replace(/^\w/, (c) => c.toUpperCase())
        current = { ...current, fraction: message.progress ?? 0, stage }
        options.onProgress?.(current)
      },
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new PdfProcessingError(
      /traineddata|fetch|network|load/i.test(detail)
        ? `The OCR language data (${options.languages.join(', ')}) could not be downloaded. Check your internet connection or content blocker and try again.`
        : 'The OCR engine could not start in this browser. Try an up-to-date Chrome, Edge or Firefox.',
    )
  }
  const abort = () => void worker.terminate()
  options.signal?.addEventListener('abort', abort)
  try {
    const out = await loadPdf(bytes, { password: options.password })
    const texts: string[] = []
    let processed = 0
    let skipped = 0
    const confidences: number[] = []

    for (const [i, index] of options.pages.entries()) {
      if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      current = { page: i, pages: options.pages.length, fraction: 0, stage: `Page ${index + 1}` }
      options.onProgress?.(current)
      const page = await doc.getPage(index + 1)
      if (options.skipTextPages) {
        const content = await page.getTextContent()
        const existing = content.items.map((item) => ('str' in item ? item.str : '')).join('').trim()
        if (existing.length > 30) {
          texts.push(`--- Page ${index + 1} ---\n(already contains text — skipped)`)
          skipped += 1
          continue
        }
      }
      // ~200 dpi gives good accuracy without exhausting memory.
      const { canvas } = await renderPageToCanvas(page, safeScale(page, 200 / 72, 12_000_000))
      const { data } = await worker.recognize(canvas, { pdfTitle: 'OCR', pdfTextOnly: true }, { text: true, pdf: true })
      releaseCanvas(canvas)
      page.cleanup()
      texts.push(`--- Page ${index + 1} ---\n${(data.text ?? '').trim()}`)
      if (typeof data.confidence === 'number') confidences.push(data.confidence)
      if (data.pdf && data.pdf.length) {
        const layerDoc = await PDFDocument.load(new Uint8Array(data.pdf))
        const [embedded] = await out.embedPdf(layerDoc, [0])
        const target = out.getPage(index)
        const frame = pageFrame(target)
        const centre = frame.toPdf(frame.width / 2, frame.height / 2)
        const angle = frame.angle(0)
        const origin = originForCentered(centre.x, centre.y, frame.width, frame.height, angle)
        target.drawPage(embedded, { x: origin.x, y: origin.y, width: frame.width, height: frame.height, rotate: degrees(angle) })
      }
      processed += 1
    }
    const pdf = await out.save({ useObjectStreams: true })
    return {
      pdf,
      text: texts.join('\n\n'),
      processedPages: processed,
      skippedPages: skipped,
      meanConfidence: confidences.length ? Math.round(confidences.reduce((a, b) => a + b, 0) / confidences.length) : null,
    }
  } finally {
    options.signal?.removeEventListener('abort', abort)
    await worker.terminate().catch(() => undefined)
  }
}
