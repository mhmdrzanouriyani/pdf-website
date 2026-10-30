import { describe, expect, it } from 'vitest'
import { formatIndices, PageRangeError, parsePageSelection, parseRanges } from '../src/lib/pageRanges'
import { safeFileName, sniffKind, validateFile, FileValidationError } from '../src/lib/files'
import { buildIndex, chunkPages, search, tokenize } from '../src/lib/ai/retrieval'
import { hasUsableText } from '../src/lib/ai/run'
import { toCellValue } from '../src/lib/convert/pdfToTables'
import { isWinAnsiText } from '../src/lib/pdf/core'
import { searchTools, TOOLS } from '../src/tools/registry'
import { makePdf } from './helpers'

describe('page ranges', () => {
  it('parses ranges, open ends and singles', () => {
    expect(parsePageSelection('1-3, 5, 8-', 10)).toEqual([0, 1, 2, 4, 7, 8, 9])
    expect(parsePageSelection('-2', 5)).toEqual([0, 1])
    expect(parsePageSelection('all', 3)).toEqual([0, 1, 2])
  })

  it('gives clear errors for invalid input', () => {
    expect(() => parseRanges('0', 5)).toThrow(PageRangeError)
    expect(() => parseRanges('7', 5)).toThrow(/outside the document/)
    expect(() => parseRanges('5-2', 5)).toThrow(/backwards/)
    expect(() => parseRanges('abc', 5)).toThrow(/not a valid/)
    expect(() => parseRanges('', 5)).toThrow(/at least one/)
  })

  it('formats indices compactly', () => {
    expect(formatIndices([0, 1, 2, 4, 6, 7])).toBe('1-3, 5, 7-8')
  })
})

describe('file validation', () => {
  it('detects real types from content, not names', async () => {
    const pdf = await makePdf(1)
    expect(sniffKind(pdf.slice(0, 64))).toBe('pdf')
    const good = new File([pdf.slice().buffer], 'report.pdf', { type: 'application/pdf' })
    await expect(validateFile(good, ['pdf'])).resolves.toBe('pdf')
    const fake = new File(['hello world'], 'fake.pdf', { type: 'application/pdf' })
    await expect(validateFile(fake, ['pdf'])).rejects.toThrow(/not a valid PDF/)
    const empty = new File([], 'empty.pdf')
    await expect(validateFile(empty, ['pdf'])).rejects.toThrow(/empty/)
    const big = new File([pdf.slice().buffer], 'big.pdf')
    await expect(validateFile(big, ['pdf'], 10)).rejects.toBeInstanceOf(FileValidationError)
    const image = new File(['GIF89a'], 'x.gif')
    await expect(validateFile(image, ['pdf'])).rejects.toThrow(/not supported/)
  })

  it('sanitizes malicious file names', () => {
    expect(safeFileName('../../etc/passwd')).toBe('-..-etc-passwd')
    expect(safeFileName('a<b>:c|d?.pdf')).toBe('a-b-c-d-.pdf')
    expect(safeFileName('\u0000\u001f')).toBe('document')
  })
})

describe('AI retrieval', () => {
  const pages = [
    { page: 1, text: 'Introduction to telescopes and optics.' },
    { page: 2, text: 'The budget review is due on 30 June 2027 according to NASA.' },
    { page: 3, text: 'آینه تلسکوپ بزرگ نور بیشتری جمع می‌کند.' },
  ]

  it('finds the passage that answers a question, with its page', () => {
    const index = buildIndex(chunkPages(pages))
    expect(search(index, 'When is the budget review due?')[0].chunk.page).toBe(2)
    expect(search(index, 'تلسکوپ')[0].chunk.page).toBe(3)
  })

  it('tokenizes non-Latin scripts', () => {
    expect(tokenize('سلام دنیا Hello')).toEqual(['سلام', 'دنیا', 'hello'])
  })

  it('chunks long pages with overlap and keeps page numbers', () => {
    const chunks = chunkPages([{ page: 7, text: 'Sentence one. '.repeat(400) }], 500, 50)
    expect(chunks.length).toBeGreaterThan(5)
    expect(chunks.every((c) => c.page === 7 && c.text.length <= 500)).toBe(true)
  })

  it('detects scanned documents without text', () => {
    expect(hasUsableText([{ page: 1, text: '' }, { page: 2, text: ' ' }])).toBe(false)
    expect(hasUsableText(pages)).toBe(true)
  })
})

describe('misc', () => {
  it('converts table cells to numbers where appropriate', () => {
    expect(toCellValue('1,234.50')).toBe(1234.5)
    expect(toCellValue('(200)')).toBe(-200)
    expect(toCellValue('45%')).toBeCloseTo(0.45)
    expect(toCellValue('007')).toBe('007')
    expect(toCellValue('Total')).toBe('Total')
  })

  it('knows which text the standard fonts can encode', () => {
    expect(isWinAnsiText('Café — “quoted” €5')).toBe(true)
    expect(isWinAnsiText('سلام')).toBe(false)
  })

  it('tool search understands common tasks', () => {
    expect(searchTools('combine two PDFs')[0].slug).toBe('merge-pdf')
    expect(searchTools('reduce PDF size')[0].slug).toBe('compress-pdf')
    expect(searchTools('convert PDF to Word')[0].slug).toBe('pdf-to-word')
    expect(searchTools('remove a page')[0].slug).toBe('remove-pages')
    expect(searchTools('add a signature')[0].slug).toBe('sign-pdf')
    expect(searchTools('translate a PDF')[0].slug).toBe('ai-translate')
    expect(searchTools('summarize a document')[0].slug).toBe('ai-summarizer')
  })

  it('registry slugs are unique', () => {
    expect(new Set(TOOLS.map((t) => t.slug)).size).toBe(TOOLS.length)
  })
})
