import { loadPdf, pageFrame } from './core'
import { canvasToBlob, closePdf, extractText, openWithPdfjs, releaseCanvas, renderPageToCanvas, safeScale, type PDFDocumentProxy } from './pdfjs'

/** Region in visual page coordinates (points, origin top-left of the displayed page). */
export type RedactRegion = { page: number; x: number; y: number; w: number; h: number }

type TextItem = { str: string; transform: number[]; width: number; height: number }

/** Finds text matches and returns approximate boxes around them (visual coordinates). */
export async function findTextRegions(doc: PDFDocumentProxy, query: string, options: { caseSensitive?: boolean } = {}) {
  const regions: RedactRegion[] = []
  const needle = options.caseSensitive ? query : query.toLowerCase()
  if (!needle.trim()) return regions
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n)
    const viewport = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    for (const item of content.items as TextItem[]) {
      if (typeof item.str !== 'string' || !item.str) continue
      const hay = options.caseSensitive ? item.str : item.str.toLowerCase()
      let from = 0
      let at = hay.indexOf(needle, from)
      while (at >= 0) {
        const [a, b, , , e, f] = item.transform
        const size = Math.hypot(a, b) || item.height
        const charW = item.width / Math.max(1, item.str.length)
        const startX = e + charW * at * (a / (Math.hypot(a, b) || 1))
        // Box in PDF space from slightly below the baseline to the top of the glyphs.
        const x1 = startX - 1
        const x2 = startX + charW * needle.length + 1
        const y1 = f - size * 0.25
        const y2 = f + size * 0.95
        const [vx1, vy1] = viewport.convertToViewportPoint(x1, y1)
        const [vx2, vy2] = viewport.convertToViewportPoint(x2, y2)
        regions.push({ page: n - 1, x: Math.min(vx1, vx2), y: Math.min(vy1, vy2), w: Math.abs(vx2 - vx1), h: Math.abs(vy2 - vy1) })
        from = at + needle.length
        at = hay.indexOf(needle, from)
      }
    }
    page.cleanup()
  }
  return regions
}

export type RedactResult = { bytes: Uint8Array; pages: number[]; verifiedTerms: { term: string; remaining: number }[] }

/**
 * True redaction: every page with at least one region is rendered to an image
 * with the regions painted solid black, and the original page (its text,
 * vector content, images and annotations) is replaced by that image. The
 * hidden content no longer exists in the output file.
 */
export async function redactPdf(
  bytes: Uint8Array,
  doc: PDFDocumentProxy,
  regions: RedactRegion[],
  options: { dpi: number; password?: string; terms?: string[]; signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<RedactResult> {
  const out = await loadPdf(bytes, { password: options.password })
  const pages = [...new Set(regions.map((r) => r.page))].sort((a, b) => a - b)
  for (const [i, index] of pages.entries()) {
    if (options.signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    options.onProgress?.(i, pages.length)
    const page = await doc.getPage(index + 1)
    const scale = safeScale(page, options.dpi / 72)
    const { canvas } = await renderPageToCanvas(page, scale)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#000'
    for (const r of regions.filter((region) => region.page === index)) {
      ctx.fillRect(Math.floor(r.x * scale), Math.floor(r.y * scale), Math.ceil(r.w * scale), Math.ceil(r.h * scale))
    }
    const blob = await canvasToBlob(canvas, 'image/png')
    releaseCanvas(canvas)
    page.cleanup()
    const image = await out.embedPng(new Uint8Array(await blob.arrayBuffer()))
    const frame = pageFrame(out.getPage(index))
    out.removePage(index)
    const replacement = out.insertPage(index, [frame.width, frame.height])
    replacement.drawImage(image, { x: 0, y: 0, width: frame.width, height: frame.height })
  }
  options.onProgress?.(pages.length, pages.length)
  const result = await out.save({ useObjectStreams: true })

  // Verify: none of the searched terms should remain in the output text.
  const verifiedTerms: { term: string; remaining: number }[] = []
  if (options.terms?.length) {
    const check = await openWithPdfjs(result)
    try {
      const text = (await extractText(check)).map((p) => p.text.toLowerCase()).join('\n')
      for (const term of options.terms) {
        const t = term.toLowerCase()
        let count = 0
        let at = text.indexOf(t)
        while (at >= 0) {
          count += 1
          at = text.indexOf(t, at + t.length)
        }
        verifiedTerms.push({ term, remaining: count })
      }
    } finally {
      await closePdf(check)
    }
  }
  return { bytes: result, pages, verifiedTerms }
}
