import { BlendMode, LineCapStyle, StandardFonts, degrees, rgb, type PDFFont, type PDFImage } from '@cantoo/pdf-lib'
import { hexToRgb01, isWinAnsiText, loadPdf, pageFrame, savePdf } from './core'

/**
 * Elements are stored in "visual" page coordinates: PDF points, origin at the
 * TOP-LEFT of the page as displayed (after rotation and crop box). Export maps
 * them into PDF user space so they land exactly where they were placed.
 */
export type ElementKind = 'text' | 'rect' | 'ellipse' | 'line' | 'draw' | 'highlight' | 'image'

export type EditorElement = {
  id: string
  page: number
  kind: ElementKind
  x: number
  y: number
  w: number
  h: number
  color: string
  strokeWidth: number
  fill: string | null
  opacity: number
  text?: string
  fontSize?: number
  /** Points relative to (x, y) for line (2 points) and freehand drawings. */
  points?: [number, number][]
  image?: { bytes: Uint8Array; kind: 'png' | 'jpg'; url: string }
  /** Rendered text image for non-Latin text (prepared by the UI before export). */
  textImage?: { bytes: Uint8Array }
}

export async function applyElements(bytes: Uint8Array, elements: EditorElement[], password?: string) {
  const doc = await loadPdf(bytes, { password })
  const fonts = new Map<string, PDFFont>()
  const font = async () => {
    if (!fonts.has('h')) fonts.set('h', await doc.embedFont(StandardFonts.Helvetica))
    return fonts.get('h')!
  }
  const imageCache = new Map<Uint8Array, PDFImage>()
  const embed = async (data: Uint8Array, kind: 'png' | 'jpg') => {
    if (!imageCache.has(data)) imageCache.set(data, kind === 'png' ? await doc.embedPng(data) : await doc.embedJpg(data))
    return imageCache.get(data)!
  }

  for (const el of elements) {
    if (el.page < 0 || el.page >= doc.getPageCount()) continue
    const page = doc.getPage(el.page)
    const frame = pageFrame(page)
    // Visual top-left → visual bottom-left → PDF space.
    const point = (vx: number, vyTop: number) => frame.toPdf(vx, frame.height - vyTop)
    const angle = degrees(frame.angle(0))
    const c = hexToRgb01(el.color)
    const color = rgb(c.r, c.g, c.b)
    const fill = el.fill ? hexToRgb01(el.fill) : null
    const origin = point(el.x, el.y + el.h) // bottom-left corner of the element box

    switch (el.kind) {
      case 'rect':
        page.drawRectangle({
          x: origin.x,
          y: origin.y,
          width: el.w,
          height: el.h,
          rotate: angle,
          borderColor: color,
          borderWidth: el.strokeWidth,
          color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
          opacity: el.opacity,
          borderOpacity: el.opacity,
        })
        break
      case 'highlight':
        page.drawRectangle({
          x: origin.x,
          y: origin.y,
          width: el.w,
          height: el.h,
          rotate: angle,
          color,
          opacity: el.opacity,
          blendMode: BlendMode.Multiply,
        })
        break
      case 'ellipse': {
        const centre = point(el.x + el.w / 2, el.y + el.h / 2)
        const sideways = frame.rotation === 90 || frame.rotation === 270
        page.drawEllipse({
          x: centre.x,
          y: centre.y,
          xScale: (sideways ? el.h : el.w) / 2,
          yScale: (sideways ? el.w : el.h) / 2,
          borderColor: color,
          borderWidth: el.strokeWidth,
          color: fill ? rgb(fill.r, fill.g, fill.b) : undefined,
          opacity: el.opacity,
          borderOpacity: el.opacity,
        })
        break
      }
      case 'line':
      case 'draw': {
        const pts = el.points ?? []
        for (let i = 1; i < pts.length; i += 1) {
          const a = point(el.x + pts[i - 1][0], el.y + pts[i - 1][1])
          const b = point(el.x + pts[i][0], el.y + pts[i][1])
          page.drawLine({ start: a, end: b, thickness: el.strokeWidth, color, opacity: el.opacity, lineCap: LineCapStyle.Round })
        }
        break
      }
      case 'image': {
        if (!el.image) break
        const image = await embed(el.image.bytes, el.image.kind)
        page.drawImage(image, { x: origin.x, y: origin.y, width: el.w, height: el.h, rotate: angle, opacity: el.opacity })
        break
      }
      case 'text': {
        const text = el.text ?? ''
        if (!text.trim()) break
        const size = el.fontSize ?? 14
        if (el.textImage || !isWinAnsiText(text)) {
          if (!el.textImage) throw new Error('Non-Latin text must be rendered before export.')
          const image = await embed(el.textImage.bytes, 'png')
          page.drawImage(image, { x: origin.x, y: origin.y, width: el.w, height: el.h, rotate: angle, opacity: el.opacity })
          break
        }
        const f = await font()
        const lineHeight = size * 1.2
        text.split('\n').forEach((line, i) => {
          // Baseline of line i, measured from the element's top.
          const base = point(el.x, el.y + size * 0.95 + i * lineHeight)
          page.drawText(line, { x: base.x, y: base.y, size, font: f, color, opacity: el.opacity, rotate: angle })
        })
        break
      }
    }
  }
  return savePdf(doc)
}
