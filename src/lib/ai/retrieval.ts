/**
 * Chunking + BM25 retrieval over extracted page text, entirely in the browser.
 * For questions about long documents, only the most relevant passages are sent
 * to the AI provider (with their page numbers) instead of the whole file.
 */
export type PageText = { page: number; text: string }
export type Chunk = { id: number; page: number; text: string }

export function chunkPages(pages: PageText[], size = 1600, overlap = 200): Chunk[] {
  const chunks: Chunk[] = []
  let id = 0
  for (const { page, text } of pages) {
    const clean = text.trim()
    if (!clean) continue
    if (clean.length <= size) {
      chunks.push({ id: id++, page, text: clean })
      continue
    }
    let start = 0
    while (start < clean.length) {
      let end = Math.min(clean.length, start + size)
      if (end < clean.length) {
        // Prefer to break at a paragraph or sentence boundary.
        const window = clean.slice(start, end)
        const breakAt = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('. '), window.lastIndexOf('\n'))
        if (breakAt > size * 0.5) end = start + breakAt + 1
      }
      chunks.push({ id: id++, page, text: clean.slice(start, end).trim() })
      if (end >= clean.length) break
      start = Math.max(end - overlap, start + 1)
    }
  }
  return chunks
}

const STOP = new Set(
  'a an and are as at be but by for from has have i if in into is it its of on or that the their them there these this to was were what when where which who why will with you your does do did how can could should would about'.split(
    ' ',
  ),
)

/** Unicode-aware tokenizer (works for Latin, Persian, Arabic, Cyrillic, CJK runs…). */
export function tokenize(text: string) {
  return (text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length > 1 && !STOP.has(token),
  )
}

export type Index = {
  chunks: Chunk[]
  tf: Map<string, number>[]
  df: Map<string, number>
  lengths: number[]
  avgLength: number
}

export function buildIndex(chunks: Chunk[]): Index {
  const tf: Map<string, number>[] = []
  const df = new Map<string, number>()
  const lengths: number[] = []
  for (const chunk of chunks) {
    const counts = new Map<string, number>()
    const tokens = tokenize(chunk.text)
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
    for (const token of counts.keys()) df.set(token, (df.get(token) ?? 0) + 1)
    tf.push(counts)
    lengths.push(tokens.length)
  }
  const avgLength = lengths.reduce((a, b) => a + b, 0) / Math.max(1, lengths.length)
  return { chunks, tf, df, lengths, avgLength }
}

export function search(index: Index, query: string, k = 8): { chunk: Chunk; score: number }[] {
  const terms = [...new Set(tokenize(query))]
  if (terms.length === 0) return []
  const N = index.chunks.length
  const k1 = 1.4
  const b = 0.75
  const scored = index.chunks.map((chunk, i) => {
    let score = 0
    for (const term of terms) {
      const f = index.tf[i].get(term)
      if (!f) continue
      const n = index.df.get(term) ?? 0
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5))
      score += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * index.lengths[i]) / (index.avgLength || 1)))
    }
    return { chunk, score }
  })
  return scored
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

/** A short excerpt around the first query term, used to show where an answer came from. */
export function excerpt(text: string, query: string, length = 220) {
  const terms = tokenize(query)
  const lower = text.toLowerCase()
  let at = -1
  for (const term of terms) {
    at = lower.indexOf(term)
    if (at >= 0) break
  }
  const start = Math.max(0, (at < 0 ? 0 : at) - 60)
  const slice = text.slice(start, start + length).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${slice}${start + length < text.length ? '…' : ''}`
}
