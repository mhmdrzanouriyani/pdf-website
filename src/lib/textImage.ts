/**
 * Renders text to a PNG with the browser's fonts. Used when text contains
 * characters the 14 standard PDF fonts cannot encode (Persian, Arabic, CJK…),
 * including right-to-left scripts.
 */
const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/

export async function renderTextImage(text: string, options: { fontSize: number; color: string; bold?: boolean; font?: string }) {
  const scale = 4
  const px = options.fontSize * scale
  const font = `${options.bold === false ? 400 : 700} ${px}px ${options.font ?? 'Geist, Inter, "Segoe UI", Tahoma, "Noto Sans", system-ui, sans-serif'}`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const lines = text.split('\n')
  const widths = lines.map((line) => measure.measureText(line).width)
  const width = Math.ceil(Math.max(...widths, 1) + px * 0.2)
  const lineHeight = Math.ceil(px * 1.25)
  const height = lineHeight * lines.length + Math.ceil(px * 0.1)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = options.color
  ctx.textBaseline = 'top'
  const rtl = RTL.test(text)
  ctx.direction = rtl ? 'rtl' : 'ltr'
  ctx.textAlign = rtl ? 'right' : 'left'
  lines.forEach((line, i) => ctx.fillText(line, rtl ? width - px * 0.1 : px * 0.1, i * lineHeight + px * 0.05))
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render text'))), 'image/png'))
  return { bytes: new Uint8Array(await blob.arrayBuffer()), widthPt: width / scale, heightPt: height / scale }
}
