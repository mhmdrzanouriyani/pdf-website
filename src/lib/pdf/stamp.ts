import { StandardFonts, degrees, rgb, type PDFImage } from '@cantoo/pdf-lib'
import {
  hexToRgb01,
  isWinAnsiText,
  loadPdf,
  originForCentered,
  pageFrame,
  PdfProcessingError,
  savePdf,
} from './core'

export type Anchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

export type WatermarkOptions = {
  /** Text watermark (Latin characters). For other scripts pass `image` rendered from the text. */
  text?: string
  image?: { bytes: Uint8Array; kind: 'png' | 'jpg' }
  /** Image width as a fraction of the page width (0–1). */
  imageScale?: number
  /** Absolute image width in points (overrides imageScale; used for text rendered as an image). */
  imageWidth?: number
  fontSize?: number
  color?: string
  opacity?: number
  rotation?: number
  anchor?: Anchor
  /** Distance from the edge for non-centred anchors, in points. */
  margin?: number
  /** 0-based pages; null = all pages. */
  pages?: number[] | null
  password?: string
}

function anchorPoint(anchor: Anchor, width: number, height: number, w: number, h: number, margin: number) {
  const [v, hzn] = anchor === 'center' ? ['middle', 'center'] : anchor.split('-')
  const cx = hzn === 'left' ? margin + w / 2 : hzn === 'right' ? width - margin - w / 2 : width / 2
  const cy = v === 'top' ? height - margin - h / 2 : v === 'bottom' ? margin + h / 2 : height / 2
  return { cx, cy }
}

export async function addWatermark(bytes: Uint8Array, options: WatermarkOptions) {
  const text = options.text?.trim()
  if (!text && !options.image) throw new PdfProcessingError('Enter watermark text or choose an image.')
  if (text && !options.image && !isWinAnsiText(text)) {
    throw new PdfProcessingError('This text needs a Unicode font. Render it as an image watermark instead.')
  }
  const doc = await loadPdf(bytes, { password: options.password })
  const opacity = Math.min(1, Math.max(0.02, options.opacity ?? 0.25))
  const rotation = options.rotation ?? 0
  const anchor = options.anchor ?? 'center'
  const margin = options.margin ?? 36
  const color = hexToRgb01(options.color ?? '#7c3aed')
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  let image: PDFImage | null = null
  if (options.image) {
    image = options.image.kind === 'png' ? await doc.embedPng(options.image.bytes) : await doc.embedJpg(options.image.bytes)
  }
  const targets = options.pages ?? doc.getPageIndices()
  if (targets.length === 0) throw new PdfProcessingError('Select at least one page.')

  for (const index of targets) {
    const page = doc.getPage(index)
    const frame = pageFrame(page)
    let w: number
    let h: number
    if (image) {
      w = options.imageWidth
        ? Math.min(frame.width * 1.5, options.imageWidth)
        : frame.width * Math.min(1, Math.max(0.05, options.imageScale ?? 0.5))
      h = (w * image.height) / image.width
    } else {
      const size = options.fontSize ?? 48
      w = font.widthOfTextAtSize(text!, size)
      h = font.heightAtSize(size, { descender: false })
    }
    const { cx, cy } = anchorPoint(anchor, frame.width, frame.height, w, h, margin)
    const centre = frame.toPdf(cx, cy)
    const angle = frame.angle(rotation)
    const origin = originForCentered(centre.x, centre.y, w, h, angle)
    if (image) {
      page.drawImage(image, { x: origin.x, y: origin.y, width: w, height: h, rotate: degrees(angle), opacity })
    } else {
      page.drawText(text!, {
        x: origin.x,
        y: origin.y,
        size: options.fontSize ?? 48,
        font,
        color: rgb(color.r, color.g, color.b),
        opacity,
        rotate: degrees(angle),
      })
    }
  }
  return savePdf(doc)
}

export type PageNumberOptions = {
  /** Template with {n} (page number) and {total}, e.g. "Page {n} of {total}". */
  template?: string
  start?: number
  pages?: number[] | null
  anchor?: Exclude<Anchor, 'middle-left' | 'center' | 'middle-right'>
  fontSize?: number
  color?: string
  margin?: number
  password?: string
}

export function formatPageLabel(template: string, n: number, total: number) {
  return template.replace(/\{n\}/g, String(n)).replace(/\{total\}/g, String(total))
}

export async function addPageNumbers(bytes: Uint8Array, options: PageNumberOptions = {}) {
  const template = options.template?.trim() || '{n}'
  if (!template.includes('{n}')) throw new PdfProcessingError('The format must contain {n} where the number goes.')
  const doc = await loadPdf(bytes, { password: options.password })
  const targets = options.pages ?? doc.getPageIndices()
  if (targets.length === 0) throw new PdfProcessingError('Select at least one page.')
  const sample = formatPageLabel(template, 1, 1)
  if (!isWinAnsiText(sample)) throw new PdfProcessingError('Use Latin characters in the page number format.')
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const size = options.fontSize ?? 11
  const color = hexToRgb01(options.color ?? '#111111')
  const margin = options.margin ?? 28
  const anchor = options.anchor ?? 'bottom-center'
  const start = Math.floor(options.start ?? 1)
  const total = start + targets.length - 1

  targets.forEach((index, i) => {
    const page = doc.getPage(index)
    const frame = pageFrame(page)
    const label = formatPageLabel(template, start + i, total)
    const w = font.widthOfTextAtSize(label, size)
    const h = font.heightAtSize(size, { descender: false })
    const { cx, cy } = anchorPoint(anchor, frame.width, frame.height, w, h, margin)
    const centre = frame.toPdf(cx, cy)
    const angle = frame.angle(0)
    const origin = originForCentered(centre.x, centre.y, w, h, angle)
    page.drawText(label, {
      x: origin.x,
      y: origin.y,
      size,
      font,
      color: rgb(color.r, color.g, color.b),
      rotate: degrees(angle),
    })
  })
  return savePdf(doc)
}
