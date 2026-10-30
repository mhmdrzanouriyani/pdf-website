import { api, jsonBody } from '../api'
import { buildIndex, chunkPages, excerpt, search, type PageText } from './retrieval'

export type AiTask =
  | 'summary'
  | 'ask'
  | 'explain'
  | 'keypoints'
  | 'dates'
  | 'entities'
  | 'extract'
  | 'notes'
  | 'study-guide'
  | 'qa'
  | 'flashcards'
  | 'translate'
  | 'explain-selection'
  | 'translate-selection'
  | 'report'
  | 'compare'

export type AiOptions = {
  length?: 'short' | 'medium' | 'detailed'
  language?: string
  responseLanguage?: string
  count?: number
}

type Passage = { page: number; pageEnd?: number; text: string; doc?: 'A' | 'B' }

type ServerReply = { text: string | null; data: unknown; model: string }

export type AiSource = { page: number; excerpt: string }

export type AiResult = {
  text: string | null
  data: unknown
  model: string
  sources: AiSource[]
  strategy: 'full' | 'retrieval' | 'condensed' | 'batched'
  note?: string
}

export class NoTextError extends Error {
  constructor() {
    super('This document has no extractable text — it is probably scanned. Run OCR PDF first, then open the OCR’d file.')
    this.name = 'NoTextError'
  }
}

/** Characters of context sent in one request (the server accepts up to 120 000 by default). */
const FULL_LIMIT = 90_000
const ASK_FULL_LIMIT = 24_000
const MAP_BATCH = 40_000
const MAX_MAP_CALLS = 14
const TRANSLATE_BATCH = 9_000

export function totalChars(pages: PageText[]) {
  return pages.reduce((sum, page) => sum + page.text.length, 0)
}

export function hasUsableText(pages: PageText[]) {
  const chars = totalChars(pages)
  return chars >= 40 && chars / Math.max(1, pages.length) >= 8
}

async function call(body: Record<string, unknown>, signal?: AbortSignal) {
  return api<ServerReply>('/api/ai/run', { ...jsonBody(body), signal, timeoutMs: 150_000 })
}

function asPassages(pages: PageText[], doc?: 'A' | 'B'): Passage[] {
  return pages.filter((p) => p.text.trim()).map((p) => ({ page: p.page, text: p.text, doc }))
}

function batches(pages: PageText[], limit: number) {
  const out: PageText[][] = []
  let current: PageText[] = []
  let size = 0
  for (const page of pages) {
    const text = page.text.length > limit ? page.text.slice(0, limit) : page.text
    if (current.length && size + text.length > limit) {
      out.push(current)
      current = []
      size = 0
    }
    current.push({ page: page.page, text })
    size += text.length
  }
  if (current.length) out.push(current)
  return out
}

/** Condenses a long document into page-cited notes, one request per batch. */
async function condense(
  pages: PageText[],
  target: AiTask,
  docName: string,
  doc: 'A' | 'B' | undefined,
  onStage: ((stage: string) => void) | undefined,
  signal?: AbortSignal,
): Promise<Passage[]> {
  const groups = batches(pages.filter((p) => p.text.trim()), MAP_BATCH)
  if (groups.length > MAX_MAP_CALLS) {
    throw new Error(
      `This document is very long (${pages.length} pages). Choose a page range of roughly ${Math.floor((pages.length * MAX_MAP_CALLS) / groups.length)} pages or fewer.`,
    )
  }
  const notes: Passage[] = []
  for (const [i, group] of groups.entries()) {
    onStage?.(`Reading part ${i + 1} of ${groups.length}${doc ? ` (document ${doc})` : ''}…`)
    const reply = await call(
      { task: 'map', docName, context: asPassages(group), options: { target } },
      signal,
    )
    notes.push({ page: group[0].page, pageEnd: group[group.length - 1].page, text: reply.text ?? '', doc })
  }
  return notes
}

export type RunArgs = {
  task: AiTask
  docName: string
  pages: PageText[]
  question?: string
  selection?: { text: string; page: number }
  history?: { role: 'user' | 'assistant'; content: string }[]
  options?: AiOptions
  /** Second document for compare. */
  docB?: { name: string; pages: PageText[] }
  signal?: AbortSignal
  onStage?: (stage: string) => void
}

/**
 * Runs an AI task on extracted document text, choosing a strategy that fits
 * the provider's context budget:
 *  - full: the whole text fits in one request;
 *  - retrieval: questions use the most relevant passages (BM25);
 *  - condensed: long documents are condensed per part, then answered from the notes;
 *  - batched: translation runs page batch by page batch.
 */
export async function runDocumentTask(args: RunArgs): Promise<AiResult> {
  const { task, docName, pages, signal, onStage } = args
  const options = args.options ?? {}
  if (!hasUsableText(pages)) throw new NoTextError()
  const total = totalChars(pages)

  if (task === 'translate') {
    const groups = batches(pages.filter((p) => p.text.trim()), TRANSLATE_BATCH)
    const parts: string[] = []
    let model = ''
    for (const [i, group] of groups.entries()) {
      onStage?.(`Translating part ${i + 1} of ${groups.length}…`)
      const reply = await call({ task, docName, context: asPassages(group), options }, signal)
      parts.push(reply.text ?? '')
      model = reply.model
    }
    return { text: parts.join('\n\n'), data: null, model, sources: [], strategy: groups.length > 1 ? 'batched' : 'full' }
  }

  if (task === 'translate-selection') {
    const sel = args.selection
    if (!sel) throw new Error('Select some text in the document first.')
    const reply = await call(
      { task, docName, selection: sel.text, context: [{ page: sel.page, text: sel.text }], options },
      signal,
    )
    return { ...reply, sources: [{ page: sel.page, excerpt: excerpt(sel.text, '', 160) }], strategy: 'full' }
  }

  if (task === 'compare') {
    const b = args.docB
    if (!b) throw new Error('Choose a second document to compare.')
    if (!hasUsableText(b.pages)) throw new NoTextError()
    const half = FULL_LIMIT / 2
    const partA = total <= half ? asPassages(pages, 'A') : await condense(pages, 'compare', docName, 'A', onStage, signal)
    const partB =
      totalChars(b.pages) <= half ? asPassages(b.pages, 'B') : await condense(b.pages, 'compare', b.name, 'B', onStage, signal)
    onStage?.('Comparing…')
    const reply = await call(
      { task, docName, docNameB: b.name, context: [...partA, ...partB], options: { ...options, partial: total > half } },
      signal,
    )
    return { ...reply, sources: [], strategy: total > half || totalChars(b.pages) > half ? 'condensed' : 'full' }
  }

  if (task === 'ask' || task === 'explain-selection') {
    const query = task === 'ask' ? (args.question ?? '') : (args.selection?.text ?? '')
    if (!query.trim()) throw new Error(task === 'ask' ? 'Type a question first.' : 'Select some text in the document first.')
    if (total <= ASK_FULL_LIMIT) {
      onStage?.('Thinking…')
      const reply = await call(
        { task, docName, question: args.question, selection: args.selection?.text, history: args.history, context: asPassages(pages), options },
        signal,
      )
      return { ...reply, sources: [], strategy: 'full' }
    }
    onStage?.('Finding relevant passages…')
    const index = buildIndex(chunkPages(pages))
    const hits = search(index, `${query} ${args.history?.slice(-2).map((h) => h.content).join(' ') ?? ''}`, 10)
    const chosen = hits.map((hit) => hit.chunk)
    if (args.selection) {
      const own = pages.find((p) => p.page === args.selection!.page)
      if (own && !chosen.some((c) => c.page === own.page)) chosen.unshift({ id: -1, page: own.page, text: own.text.slice(0, 6000) })
    }
    if (chosen.length === 0) {
      // Nothing matched lexically — fall back to the opening pages so the model can still say what the document covers.
      chosen.push(...chunkPages(pages).slice(0, 6))
    }
    chosen.sort((a, b) => a.page - b.page)
    onStage?.('Thinking…')
    const reply = await call(
      {
        task,
        docName,
        question: args.question,
        selection: args.selection?.text,
        history: args.history,
        context: chosen.map((c) => ({ page: c.page, text: c.text })),
        options: { ...options, partial: true },
      },
      signal,
    )
    const seen = new Set<number>()
    const sources = hits
      .filter((hit) => (seen.has(hit.chunk.page) ? false : (seen.add(hit.chunk.page), true)))
      .slice(0, 5)
      .map((hit) => ({ page: hit.chunk.page, excerpt: excerpt(hit.chunk.text, query) }))
    return { ...reply, sources, strategy: 'retrieval' }
  }

  // Whole-document tasks.
  if (total <= FULL_LIMIT) {
    onStage?.('Analysing the document…')
    const reply = await call({ task, docName, context: asPassages(pages), options }, signal)
    return { ...reply, sources: [], strategy: 'full' }
  }
  const notes = await condense(pages, task, docName, undefined, onStage, signal)
  onStage?.('Writing the result…')
  const reply = await call({ task, docName, context: notes, options: { ...options, partial: true } }, signal)
  return {
    ...reply,
    sources: [],
    strategy: 'condensed',
    note: `This document is long, so it was condensed in ${notes.length} parts before the final answer.`,
  }
}

export type AiStatus = { configured: boolean; provider: string | null; model: string | null; problem: string | null }

export function getAiStatus(signal?: AbortSignal) {
  return api<AiStatus>('/api/ai/status', { signal, timeoutMs: 8000 })
}
