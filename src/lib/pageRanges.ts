export class PageRangeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PageRangeError'
  }
}

export type PageRange = { start: number; end: number } // 1-based, inclusive

/**
 * Parses expressions like "1-3, 5, 8-" into validated 1-based ranges.
 * "8-" means page 8 to the end, "-3" means pages 1–3. "all" selects everything.
 * Throws PageRangeError with a human readable message on invalid input.
 */
export function parseRanges(input: string, pageCount: number): PageRange[] {
  if (pageCount < 1) throw new PageRangeError('The document has no pages.')
  const text = input.trim().toLowerCase()
  if (!text) throw new PageRangeError('Enter at least one page or range, e.g. 1-3, 5.')
  if (text === 'all') return [{ start: 1, end: pageCount }]

  const parts = text.split(/[,;]+/).map((part) => part.trim()).filter(Boolean)
  if (parts.length === 0) throw new PageRangeError('Enter at least one page or range, e.g. 1-3, 5.')

  return parts.map((part) => {
    const single = /^(\d+)$/.exec(part)
    const range = /^(\d*)\s*[-–]\s*(\d*)$/.exec(part)
    let start: number
    let end: number
    if (single) {
      start = end = Number(single[1])
    } else if (range && (range[1] || range[2])) {
      start = range[1] ? Number(range[1]) : 1
      end = range[2] ? Number(range[2]) : pageCount
    } else {
      throw new PageRangeError(`“${part}” is not a valid page or range.`)
    }
    if (start < 1 || end < 1) throw new PageRangeError('Page numbers start at 1.')
    if (start > pageCount || end > pageCount) {
      throw new PageRangeError(`“${part}” is outside the document — it has ${pageCount} page${pageCount === 1 ? '' : 's'}.`)
    }
    if (start > end) throw new PageRangeError(`“${part}” goes backwards. Write it as ${end}-${start}.`)
    return { start, end }
  })
}

/** Flattens ranges into a sorted list of unique 0-based page indices. */
export function rangesToIndices(ranges: PageRange[]): number[] {
  const set = new Set<number>()
  for (const { start, end } of ranges) {
    for (let page = start; page <= end; page += 1) set.add(page - 1)
  }
  return [...set].sort((a, b) => a - b)
}

export function parsePageSelection(input: string, pageCount: number) {
  return rangesToIndices(parseRanges(input, pageCount))
}

/** Formats 0-based indices back to a compact "1-3, 5" string. */
export function formatIndices(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((a, b) => a - b)
  const out: string[] = []
  let i = 0
  while (i < sorted.length) {
    let j = i
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1
    out.push(i === j ? `${sorted[i] + 1}` : `${sorted[i] + 1}-${sorted[j] + 1}`)
    i = j + 1
  }
  return out.join(', ')
}
