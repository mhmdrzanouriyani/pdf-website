import { pageLayout, type LayoutLine } from '../pdf/layout'
import type { PDFDocumentProxy } from '../pdf/pdfjs'
import type { Cell, Sheet } from '../xlsx'

/** Splits a line into cells wherever there is a wide horizontal gap. */
function cellsOf(line: LayoutLine) {
  const cells: { x: number; text: string }[] = []
  let current: { x: number; text: string; end: number } | null = null
  for (const item of line.items) {
    // pdf.js fills visual gaps with whitespace-only items; a wide one is a column break.
    if (!item.str.trim()) {
      if (current && item.width > Math.max(item.size * 1.2, 6)) {
        cells.push({ x: current.x, text: current.text.trim() })
        current = null
      }
      continue
    }
    const gap = current ? item.x - current.end : Infinity
    if (!current || gap > Math.max(item.size * 1.2, 6)) {
      if (current) cells.push({ x: current.x, text: current.text.trim() })
      current = { x: item.x, text: item.str, end: item.x + item.width }
    } else {
      current.text += (gap > item.size * 0.18 ? ' ' : '') + item.str
      current.end = item.x + item.width
    }
  }
  if (current) cells.push({ x: current.x, text: current.text.trim() })
  return cells.filter((c) => c.text)
}

const NUMBER_RE = /^[-+(]?[$€£¥]?\s?\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\)?%?$|^[-+]?\d+(?:\.\d+)?%?$/

export function toCellValue(text: string): Cell {
  const t = text.trim()
  if (!NUMBER_RE.test(t) || /^0\d/.test(t)) return t
  const negative = /^\(.*\)$/.test(t) || t.startsWith('-')
  const n = Number(t.replace(/[()$€£¥%,\s+-]/g, ''))
  if (!Number.isFinite(n)) return t
  return (negative ? -n : n) / (t.endsWith('%') ? 100 : 1)
}

/**
 * Heuristic table extraction: on each page, lines are split into cells at wide
 * gaps, and cell start positions are clustered into columns. Works well for
 * simple, text-based tables; merged cells and scanned tables are not handled.
 */
export async function pdfToSheets(doc: PDFDocumentProxy, onProgress?: (done: number, total: number) => void, signal?: AbortSignal) {
  const sheets: Sheet[] = []
  let multiColumnRows = 0
  for (let n = 1; n <= doc.numPages; n += 1) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const page = await doc.getPage(n)
    const layout = await pageLayout(page)
    page.cleanup()
    const lineCells = layout.lines.map(cellsOf)
    // Cluster x positions into column anchors.
    const xs = lineCells.flat().map((c) => c.x).sort((a, b) => a - b)
    const anchors: number[] = []
    for (const x of xs) {
      if (!anchors.length || x - anchors[anchors.length - 1] > 14) anchors.push(x)
    }
    const rows: Cell[][] = lineCells.map((cells) => {
      const row: Cell[] = []
      for (const cell of cells) {
        let col = 0
        for (let i = 0; i < anchors.length; i += 1) if (anchors[i] <= cell.x + 7) col = i
        while (row[col] !== undefined && row[col] !== null) col += 1
        row[col] = toCellValue(cell.text)
      }
      if (cells.length > 1) multiColumnRows += 1
      return Array.from(row, (v) => v ?? null)
    })
    // Drop columns that are empty on every row.
    const width = Math.max(0, ...rows.map((r) => r.length))
    const keep = Array.from({ length: width }, (_, c) => rows.some((r) => r[c] !== null && r[c] !== undefined))
    sheets.push({ name: `Page ${n}`, rows: rows.map((r) => keep.map((k, c) => (k ? (r[c] ?? null) : undefined)).filter((v) => v !== undefined) as Cell[]) })
    onProgress?.(n, doc.numPages)
  }
  const totalText = sheets.reduce((sum, s) => sum + s.rows.length, 0)
  if (totalText === 0) throw new Error('No selectable text was found — this PDF is probably scanned. Run OCR PDF first.')
  return { sheets, multiColumnRows }
}
