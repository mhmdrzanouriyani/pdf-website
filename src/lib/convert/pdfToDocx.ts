import { AlignmentType, Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from 'docx'
import { median, pageLayout, RTL_RE, type LayoutLine } from '../pdf/layout'
import type { PDFDocumentProxy } from '../pdf/pdfjs'

type Block = { kind: 'heading1' | 'heading2' | 'paragraph'; lines: LayoutLine[]; center: boolean }

/**
 * Builds a real .docx from the PDF's text layer: paragraphs are reconstructed
 * from line spacing, larger lines become headings, bold/italic runs are kept,
 * each PDF page starts on a new Word page, and RTL scripts are marked as such.
 * Images, columns and exact positioning are not reproduced.
 */
export async function pdfToDocx(doc: PDFDocumentProxy, onProgress?: (done: number, total: number) => void, signal?: AbortSignal) {
  const layouts = []
  for (let n = 1; n <= doc.numPages; n += 1) {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const page = await doc.getPage(n)
    layouts.push(await pageLayout(page))
    page.cleanup()
    onProgress?.(n, doc.numPages)
  }
  const body = median(layouts.flatMap((l) => l.lines.map((line) => Math.round(line.size * 2) / 2))) || 11
  const children: Paragraph[] = []
  let textChars = 0

  layouts.forEach((layout, pageIndex) => {
    const blocks: Block[] = []
    let previous: LayoutLine | null = null
    for (const line of layout.lines) {
      textChars += line.text.length
      const ratio = line.size / body
      const short = line.text.length < 110
      const kind: Block['kind'] = ratio >= 1.6 && short ? 'heading1' : ratio >= 1.18 && short ? 'heading2' : 'paragraph'
      const width = line.xEnd - line.x
      const center = Math.abs(line.x - (layout.width - line.xEnd)) < layout.width * 0.04 && width < layout.width * 0.7
      const gap = previous ? line.y - previous.y : Infinity
      const last = blocks[blocks.length - 1]
      const continues =
        last &&
        last.kind === kind &&
        kind === 'paragraph' &&
        previous &&
        gap < Math.max(previous.size, line.size) * 1.65 &&
        Math.abs(line.x - last.lines[0].x) < line.size * 3 &&
        !/^[•\-–·▪●◦*]\s|^\d+[.)]\s/.test(line.text)
      if (continues) last.lines.push(line)
      else blocks.push({ kind, lines: [line], center })
      previous = line
    }

    blocks.forEach((block) => {
      const runs: TextRun[] = []
      const rtl = RTL_RE.test(block.lines.map((l) => l.text).join(' '))
      block.lines.forEach((line, li) => {
        line.items.forEach((item, ii) => {
          let text = item.str
          if (ii === 0 && li > 0) {
            text = ` ${text.trimStart()}`
          }
          runs.push(
            new TextRun({
              text,
              bold: block.kind === 'paragraph' ? item.bold : undefined,
              italics: item.italic,
              rightToLeft: rtl || undefined,
              size: block.kind === 'paragraph' && Math.abs(item.size - body) > 1.5 ? Math.round(item.size * 2) : undefined,
            }),
          )
        })
      })
      children.push(
        new Paragraph({
          children: runs,
          heading: block.kind === 'heading1' ? HeadingLevel.HEADING_1 : block.kind === 'heading2' ? HeadingLevel.HEADING_2 : undefined,
          alignment: block.center ? AlignmentType.CENTER : rtl ? AlignmentType.RIGHT : undefined,
          bidirectional: rtl || undefined,
          spacing: { after: 120 },
        }),
      )
    })
    if (pageIndex < layouts.length - 1) children.push(new Paragraph({ children: [new PageBreak()] }))
  })

  if (textChars < 20) {
    throw new Error('No selectable text was found — this PDF is probably scanned. Run OCR PDF first, then convert the OCR’d file.')
  }

  const document = new Document({
    creator: 'PDFLY',
    styles: { default: { document: { run: { font: 'Calibri', size: Math.round(body * 2) } } } },
    sections: [{ children }],
  })
  return { blob: await Packer.toBlob(document), pages: layouts.length, paragraphs: children.length }
}
