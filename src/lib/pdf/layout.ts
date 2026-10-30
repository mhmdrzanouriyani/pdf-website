import type { PDFPageProxy } from './pdfjs'

export type LayoutItem = { str: string; x: number; width: number; size: number; bold: boolean; italic: boolean }
export type LayoutLine = { y: number; x: number; xEnd: number; size: number; items: LayoutItem[]; text: string }
export type PageLayout = { width: number; height: number; lines: LayoutLine[] }

type RawItem = { str: string; transform: number[]; width: number; height: number; fontName: string; hasEOL?: boolean }
type FontInfo = { name?: string; bold?: boolean; black?: boolean; italic?: boolean }

export const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/

/**
 * Reads positioned text from a page: lines (top to bottom) made of items with
 * font size and bold/italic flags. Coordinates are in PDF points from the
 * top-left of the visible page.
 */
export async function pageLayout(page: PDFPageProxy): Promise<PageLayout> {
  const viewport = page.getViewport({ scale: 1 })
  const content = await page.getTextContent()
  // Loading the operator list makes font objects (with their real names) available.
  let fonts = new Map<string, FontInfo>()
  try {
    await page.getOperatorList()
    fonts = new Map()
    for (const item of content.items as RawItem[]) {
      if (!item.fontName || fonts.has(item.fontName)) continue
      try {
        fonts.set(item.fontName, page.commonObjs.get(item.fontName) as FontInfo)
      } catch {
        fonts.set(item.fontName, {})
      }
    }
  } catch {
    // Without operator list we simply lose bold/italic detection.
  }
  const styles = content.styles as Record<string, { fontFamily?: string }>

  const items = (content.items as RawItem[])
    .filter((item) => typeof item.str === 'string' && item.str.length > 0)
    .map((item) => {
      const [a, b, , , e, f] = item.transform
      const size = Math.hypot(a, b) || item.height || 10
      // Convert to top-left based coordinates of the (possibly rotated) viewport.
      const [vx, vy] = viewport.convertToViewportPoint(e, f)
      const font = fonts.get(item.fontName) ?? {}
      const label = `${font.name ?? ''} ${styles[item.fontName]?.fontFamily ?? ''}`
      return {
        str: item.str,
        x: vx,
        y: vy,
        width: item.width,
        size,
        bold: Boolean(font.bold || font.black) || /bold|black|heavy|semibold|demi/i.test(label),
        italic: Boolean(font.italic) || /italic|oblique/i.test(label),
      }
    })
    .sort((p, q) => p.y - q.y || p.x - q.x)

  const lines: LayoutLine[] = []
  for (const item of items) {
    // Items are sorted by y, so only the last few lines can match (keeps this linear).
    let line: LayoutLine | undefined
    for (let k = lines.length - 1; k >= Math.max(0, lines.length - 4); k -= 1) {
      const l = lines[k]
      if (Math.abs(l.y - item.y) <= Math.max(2, Math.min(l.size, item.size) * 0.45)) {
        line = l
        break
      }
    }
    if (line) {
      line.items.push(item)
      line.size = Math.max(line.size, item.size)
      line.x = Math.min(line.x, item.x)
      line.xEnd = Math.max(line.xEnd, item.x + item.width)
    } else {
      lines.push({ y: item.y, x: item.x, xEnd: item.x + item.width, size: item.size, items: [item], text: '' })
    }
  }
  for (const line of lines) {
    line.items.sort((p, q) => p.x - q.x)
    // Insert spaces where items are visibly separated.
    let text = ''
    let lastEnd = -Infinity
    for (const item of line.items) {
      if (text && item.x - lastEnd > item.size * 0.18 && !text.endsWith(' ') && !item.str.startsWith(' ')) text += ' '
      text += item.str
      lastEnd = item.x + item.width
    }
    line.text = text.replace(/\s+/g, ' ').trim()
  }
  lines.sort((p, q) => p.y - q.y)
  return { width: viewport.width, height: viewport.height, lines: lines.filter((l) => l.text) }
}

export function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}
