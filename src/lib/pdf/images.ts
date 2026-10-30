import { PDFDocument, clip, endPath, popGraphicsState, pushGraphicsState, rectangle } from '@cantoo/pdf-lib'
import { PdfProcessingError, savePdf } from './core'

export type ImageInput = { bytes: Uint8Array; kind: 'jpg' | 'png' }

export const PAGE_SIZES = {
  a4: { label: 'A4', width: 595.28, height: 841.89 },
  letter: { label: 'US Letter', width: 612, height: 792 },
  legal: { label: 'US Legal', width: 612, height: 1008 },
  a5: { label: 'A5', width: 419.53, height: 595.28 },
} as const

export type PageSizeId = keyof typeof PAGE_SIZES | 'fit'

export type ImagesToPdfOptions = {
  /** 'fit' makes each page exactly the size of its image. */
  pageSize?: PageSizeId
  orientation?: 'auto' | 'portrait' | 'landscape'
  /** Margin in points (ignored for pageSize 'fit'). */
  margin?: number
  /** contain = whole image visible; cover = fill the page and crop overflow; stretch = distort to fill. */
  fit?: 'contain' | 'cover' | 'stretch'
}

export async function imagesToPdf(images: ImageInput[], options: ImagesToPdfOptions = {}) {
  if (images.length === 0) throw new PdfProcessingError('Add at least one image.')
  const doc = await PDFDocument.create()
  const pageSize = options.pageSize ?? 'a4'
  const margin = Math.max(0, options.margin ?? 0)
  const fit = options.fit ?? 'contain'

  for (const [index, input] of images.entries()) {
    let image
    try {
      image = input.kind === 'png' ? await doc.embedPng(input.bytes) : await doc.embedJpg(input.bytes)
    } catch {
      throw new PdfProcessingError(`Image ${index + 1} could not be read. It may be damaged or use an unsupported encoding.`)
    }
    const iw = image.width
    const ih = image.height

    if (pageSize === 'fit') {
      // 1 image pixel = 1 point (72 dpi): keeps the native aspect and resolution.
      const page = doc.addPage([iw, ih])
      page.drawImage(image, { x: 0, y: 0, width: iw, height: ih })
      continue
    }

    const base = PAGE_SIZES[pageSize]
    const landscape =
      options.orientation === 'landscape' || ((options.orientation ?? 'auto') === 'auto' && iw > ih)
    const pw = landscape ? base.height : base.width
    const ph = landscape ? base.width : base.height
    const page = doc.addPage([pw, ph])
    const boxW = pw - margin * 2
    const boxH = ph - margin * 2
    if (boxW <= 0 || boxH <= 0) throw new PdfProcessingError('The margin is larger than the page.')

    if (fit === 'stretch') {
      page.drawImage(image, { x: margin, y: margin, width: boxW, height: boxH })
      continue
    }
    const scale = fit === 'cover' ? Math.max(boxW / iw, boxH / ih) : Math.min(boxW / iw, boxH / ih)
    const w = iw * scale
    const h = ih * scale
    const x = margin + (boxW - w) / 2
    const y = margin + (boxH - h) / 2
    if (fit === 'cover') {
      // Clip to the margin box so the overflow is genuinely hidden.
      page.pushOperators(...clipRect(margin, margin, boxW, boxH))
      page.drawImage(image, { x, y, width: w, height: h })
      page.pushOperators(popGraphicsState())
    } else {
      page.drawImage(image, { x, y, width: w, height: h })
    }
  }
  return savePdf(doc)
}

function clipRect(x: number, y: number, w: number, h: number) {
  return [pushGraphicsState(), rectangle(x, y, w, h), clip(), endPath()]
}
