import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName } from '@cantoo/pdf-lib'
import { cropPages, extractPages, mergePdfs, organizePages, removePages, rotatePages, splitByRanges, splitEvery } from '../src/lib/pdf/pages'
import { addPageNumbers, addWatermark } from '../src/lib/pdf/stamp'
import { protectPdf, readMetadata, unlockPdf, writeMetadata, isEncrypted } from '../src/lib/pdf/security'
import { imagesToPdf } from '../src/lib/pdf/images'
import { compressPdf } from '../src/lib/pdf/compress'
import { applyElements } from '../src/lib/pdf/annotate'
import { loadPdf, PdfPasswordError, PdfProcessingError, pageFrame } from '../src/lib/pdf/core'
import { parseRanges } from '../src/lib/pageRanges'
import { fixture, info, makePdf, textOf } from './helpers'

describe('merge', () => {
  it('combines the actual pages of every input in order', async () => {
    const a = await makePdf(2, { extra: 'doc A' })
    const b = await makePdf(3, { extra: 'doc B' })
    const merged = await mergePdfs([{ bytes: b }, { bytes: a }])
    const text = await textOf(merged)
    expect(text).toHaveLength(5)
    expect(text[0]).toContain('doc B')
    expect(text[2]).toContain('Page 3')
    expect(text[3]).toContain('doc A')
    expect(text[4]).toContain('Page 2')
  })

  it('rejects fewer than two files', async () => {
    await expect(mergePdfs([{ bytes: await makePdf(1) }])).rejects.toBeInstanceOf(PdfProcessingError)
  })
})

describe('split / extract / remove', () => {
  it('splits by ranges into the expected pages', async () => {
    const src = await makePdf(6)
    const parts = await splitByRanges(src, parseRanges('1-2, 3, 5-', 6))
    expect(parts.map((p) => p.label)).toEqual(['pages-1-2', 'page-3', 'pages-5-6'])
    expect(await textOf(parts[0].bytes)).toEqual(['Page 1', 'Page 2'])
    expect(await textOf(parts[2].bytes)).toEqual(['Page 5', 'Page 6'])
  })

  it('splits every page', async () => {
    const parts = await splitEvery(await makePdf(4), 1)
    expect(parts).toHaveLength(4)
    expect(await textOf(parts[3].bytes)).toEqual(['Page 4'])
  })

  it('extracts selected pages', async () => {
    const out = await extractPages(await makePdf(5), [4, 0])
    expect(await textOf(out)).toEqual(['Page 5', 'Page 1'])
  })

  it('removes pages and refuses to remove all of them', async () => {
    const src = await makePdf(4)
    expect(await textOf(await removePages(src, [1, 2]))).toEqual(['Page 1', 'Page 4'])
    await expect(removePages(src, [0, 1, 2, 3])).rejects.toThrow(/at least one page/)
  })

  it('rejects out-of-range pages', async () => {
    await expect(extractPages(await makePdf(2), [5])).rejects.toThrow(/does not exist/)
  })
})

describe('organize & rotate', () => {
  it('reordering, duplicating and deleting changes the real output', async () => {
    const out = await organizePages(await makePdf(3), [
      { source: 2, rotation: 0 },
      { source: 0, rotation: 90 },
      { source: 0, rotation: 0 },
    ])
    const result = await info(out)
    expect(await textOf(out)).toEqual(['Page 3', 'Page 1', 'Page 1'])
    expect(result.rotations).toEqual([0, 90, 0])
  })

  it('rotation is preserved and added to existing rotation', async () => {
    const src = await makePdf(3, { rotate: [0, 90, 0] })
    const out = await rotatePages(src, 90, [1, 2])
    expect((await info(out)).rotations).toEqual([0, 180, 90])
    const all = await rotatePages(src, 270, null)
    expect((await info(all)).rotations).toEqual([270, 0, 270])
  })
})

describe('crop', () => {
  it('writes a real crop box', async () => {
    const out = await cropPages(await makePdf(2), { top: 100, right: 50, bottom: 50, left: 50 }, [0])
    const { sizes } = await info(out)
    expect(sizes[0]).toEqual([495, 692])
    expect(sizes[1]).toEqual([595, 842])
  })

  it('maps visual margins correctly on rotated pages', async () => {
    const out = await cropPages(await makePdf(1, { rotate: [90] }), { top: 100, right: 0, bottom: 0, left: 0 }, null)
    const doc = await PDFDocument.load(out)
    const frame = pageFrame(doc.getPage(0))
    // Displayed page is 842 wide x 595 tall; trimming 100 from the visible top leaves 495.
    expect(Math.round(frame.width)).toBe(842)
    expect(Math.round(frame.height)).toBe(495)
  })
})

describe('watermark & page numbers', () => {
  it('watermark text appears on the selected pages only', async () => {
    const out = await addWatermark(await makePdf(3), { text: 'CONFIDENTIAL', pages: [0, 2] })
    const text = await textOf(out)
    expect(text[0]).toContain('CONFIDENTIAL')
    expect(text[1]).not.toContain('CONFIDENTIAL')
    expect(text[2]).toContain('CONFIDENTIAL')
  })

  it('image watermark is embedded', async () => {
    const out = await addWatermark(await makePdf(1), { image: { bytes: fixture('tiny.png'), kind: 'png' } })
    expect(out.length).toBeGreaterThan((await makePdf(1)).length)
  })

  it('refuses non-Latin text for the standard font (UI renders it as an image)', async () => {
    await expect(addWatermark(await makePdf(1), { text: 'محرمانه' })).rejects.toThrow(/Unicode/)
  })

  it('page numbers follow the template, start number and page range', async () => {
    const out = await addPageNumbers(await makePdf(4), { template: 'Page {n} of {total}', start: 1, pages: [1, 2, 3] })
    const text = await textOf(out)
    expect(text[0]).not.toContain('of')
    expect(text[1]).toContain('Page 1 of 3')
    expect(text[3]).toContain('Page 3 of 3')
  })
})

describe('protect / unlock / metadata', () => {
  it('encrypts with a password and unlocks only with the right one', async () => {
    const src = await makePdf(2)
    const locked = await protectPdf(src, { userPassword: 's3cret!' })
    expect(await isEncrypted(locked)).toBe(true)
    await expect(loadPdf(locked)).rejects.toBeInstanceOf(PdfPasswordError)
    await expect(unlockPdf(locked, 'wrong')).rejects.toBeInstanceOf(PdfPasswordError)
    const opened = await unlockPdf(locked, 's3cret!')
    expect(await isEncrypted(opened)).toBe(false)
    expect(await textOf(opened)).toEqual(['Page 1', 'Page 2'])
    // pdf.js (a different implementation) can open the encrypted file with the password.
    expect(await textOf(locked, 's3cret!')).toEqual(['Page 1', 'Page 2'])
  })

  it('rejects weak passwords and unlocking unencrypted files', async () => {
    await expect(protectPdf(await makePdf(1), { userPassword: 'ab' })).rejects.toThrow(/at least 4/)
    await expect(unlockPdf(await makePdf(1), 'x')).rejects.toThrow(/not encrypted/)
  })

  it('edits and strips metadata', async () => {
    const edited = await writeMetadata(await makePdf(1), { title: 'Quarterly', author: 'Mohammad', keywords: 'a, b' })
    const meta = await readMetadata(edited)
    expect(meta.title).toBe('Quarterly')
    expect(meta.author).toBe('Mohammad')
    const stripped = await readMetadata(await writeMetadata(edited, { stripAll: true }))
    expect(stripped.title).toBe('')
    expect(stripped.author).toBe('')
    expect(stripped.hasXmp).toBe(false)
  })
})

describe('images to PDF', () => {
  it('creates one page per image with the chosen layout', async () => {
    const out = await imagesToPdf(
      [
        { bytes: fixture('tiny.jpg'), kind: 'jpg' },
        { bytes: fixture('tiny.png'), kind: 'png' },
      ],
      { pageSize: 'a4', orientation: 'auto', margin: 18 },
    )
    const result = await info(out)
    expect(result.pages).toBe(2)
    expect(result.sizes[0]).toEqual([842, 595]) // landscape image → landscape page
    expect(result.sizes[1]).toEqual([595, 842])
  })

  it('"same as image" uses the image size', async () => {
    const out = await imagesToPdf([{ bytes: fixture('tiny.jpg'), kind: 'jpg' }], { pageSize: 'fit' })
    expect((await info(out)).sizes[0]).toEqual([64, 48])
  })

  it('reports corrupt images', async () => {
    await expect(imagesToPdf([{ bytes: new Uint8Array([1, 2, 3]), kind: 'png' }])).rejects.toThrow(/could not be read/)
  })
})

describe('compress', () => {
  it('never returns a larger file and reports honestly when nothing was gained', async () => {
    const src = await makePdf(3)
    const report = await compressPdf(src, 'max-quality', null)
    expect(report.newSize).toBeLessThanOrEqual(report.originalSize)
    if (report.unchanged) expect(report.bytes).toBe(src)
    expect((await info(report.bytes)).pages).toBe(3)
  })

  it('deflates uncompressed streams', async () => {
    const doc = await PDFDocument.create()
    const page = doc.addPage()
    // A large uncompressed content stream.
    const ops = Array.from({ length: 4000 }, (_, i) => `${i % 500} ${i % 700} m ${(i + 7) % 500} ${(i + 3) % 700} l S`).join('\n')
    const stream = doc.context.stream(ops)
    page.node.set(PDFName.of('Contents'), doc.context.register(stream))
    const src = await doc.save({ useObjectStreams: false })
    const report = await compressPdf(src, 'max-quality', null)
    expect(report.unchanged).toBe(false)
    expect(report.streamsDeflated).toBeGreaterThan(0)
    expect(report.newSize).toBeLessThan(report.originalSize * 0.6)
  })
})

describe('edit / sign overlay', () => {
  it('draws new text where it was placed', async () => {
    const out = await applyElements(await makePdf(2), [
      { id: 'a', page: 1, kind: 'text', x: 100, y: 100, w: 120, h: 20, color: '#ff0000', strokeWidth: 1, fill: null, opacity: 1, text: 'Approved', fontSize: 16 },
      { id: 'b', page: 0, kind: 'rect', x: 10, y: 10, w: 50, h: 50, color: '#000000', strokeWidth: 2, fill: null, opacity: 1 },
      { id: 'c', page: 0, kind: 'image', x: 10, y: 10, w: 50, h: 50, color: '#000000', strokeWidth: 0, fill: null, opacity: 1, image: { bytes: fixture('tiny.png'), kind: 'png', url: '' } },
    ])
    const text = await textOf(out)
    expect(text[1]).toContain('Approved')
    expect(text[0]).not.toContain('Approved')
  })
})

describe('pdf → excel table detection', () => {
  it('splits columns separated by wide gaps (including pdf.js whitespace fill items)', async () => {
    const { pdfToSheets } = await import('../src/lib/convert/pdfToTables')
    const { PDFDocument, StandardFonts } = await import('@cantoo/pdf-lib')
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([595, 842])
    const rows = [['Region', 'Q1', 'Q2'], ['North', '1,200', '1,450'], ['Total', '2,180', '2,470']]
    rows.forEach((row, r) => row.forEach((cell, c) => page.drawText(cell, { x: 72 + c * 150, y: 700 - r * 20, size: 11, font })))
    const bytes = await doc.save()
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const proxy = await pdfjs.getDocument({ data: bytes }).promise
    const { sheets } = await pdfToSheets(proxy as never)
    expect(sheets[0].rows).toEqual([
      ['Region', 'Q1', 'Q2'],
      ['North', 1200, 1450],
      ['Total', 2180, 2470],
    ])
  })
})
