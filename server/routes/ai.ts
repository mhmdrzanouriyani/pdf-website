import { Router } from 'express'
import { aiConfigProblem, config } from '../config.ts'
import { getProvider } from '../ai/providers.ts'
import { buildPrompt, JSON_TASKS, parseJsonReply, TASKS, type ContextPassage, type Task, type TaskInput } from '../ai/prompts.ts'
import { asyncHandler, HttpError, rateLimit } from '../lib/http.ts'

export const aiRouter = Router()

aiRouter.get('/status', (_req, res) => {
  const provider = getProvider()
  res.json({
    configured: Boolean(provider),
    provider: provider?.name ?? null,
    model: provider?.model ?? null,
    problem: provider ? null : aiConfigProblem(),
    maxContextChars: config.ai.maxContextChars,
  })
})

const LANGUAGE_RE = /^[\p{L}\p{M} ()\-–,.]{2,40}$/u

function str(value: unknown, max: number, field: string, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, 'invalid', `${field} is required.`)
    return undefined
  }
  if (typeof value !== 'string') throw new HttpError(400, 'invalid', `${field} must be text.`)
  if (value.length > max) throw new HttpError(413, 'too_large', `${field} is too long (max ${max} characters).`)
  return value
}

/** Validates and normalises the untrusted request body. */
export function parseTaskInput(body: unknown): TaskInput {
  if (!body || typeof body !== 'object') throw new HttpError(400, 'invalid', 'Missing request body.')
  const raw = body as Record<string, unknown>
  const task = raw.task as Task
  if (!TASKS.includes(task)) throw new HttpError(400, 'invalid', 'Unknown AI task.')

  if (!Array.isArray(raw.context) || raw.context.length === 0) {
    throw new HttpError(422, 'no_text', 'There is no document text to analyse. Scanned PDFs need OCR first.')
  }
  if (raw.context.length > 400) throw new HttpError(413, 'too_large', 'Too many passages in one request.')
  let total = 0
  const context: ContextPassage[] = raw.context.map((item: unknown) => {
    const p = item as Record<string, unknown>
    const page = Number(p.page)
    const pageEnd = p.pageEnd === undefined ? undefined : Number(p.pageEnd)
    if (!Number.isInteger(page) || page < 1 || page > 100_000) throw new HttpError(400, 'invalid', 'Invalid page number in context.')
    if (pageEnd !== undefined && (!Number.isInteger(pageEnd) || pageEnd < page)) throw new HttpError(400, 'invalid', 'Invalid page range in context.')
    const text = str(p.text, 40_000, 'Passage text', true)!
    total += text.length
    const doc = p.doc === 'A' || p.doc === 'B' ? p.doc : undefined
    return { page, pageEnd, text, doc }
  })
  if (total > config.ai.maxContextChars) {
    throw new HttpError(413, 'too_large', `The document context is too long for one request (${total} > ${config.ai.maxContextChars} characters).`)
  }
  if (context.every((p) => !p.text.trim())) {
    throw new HttpError(422, 'no_text', 'There is no document text to analyse. Scanned PDFs need OCR first.')
  }

  const options = (raw.options && typeof raw.options === 'object' ? raw.options : {}) as Record<string, unknown>
  const length = options.length
  const language = str(options.language, 40, 'Language')
  const responseLanguage = str(options.responseLanguage, 40, 'Response language')
  for (const lang of [language, responseLanguage]) {
    if (lang && !LANGUAGE_RE.test(lang)) throw new HttpError(400, 'invalid', 'Language names may only contain letters.')
  }
  const target = options.target as Task | undefined
  const input: TaskInput = {
    task,
    docName: (str(raw.docName, 200, 'Document name') ?? 'document').replace(/[<>"]/g, ''),
    docNameB: str(raw.docNameB, 200, 'Document name')?.replace(/[<>"]/g, ''),
    context,
    question: str(raw.question, 2000, 'Question', task === 'ask'),
    selection: str(raw.selection, 6000, 'Selected text', task === 'explain-selection' || task === 'translate-selection'),
    history: Array.isArray(raw.history)
      ? raw.history.slice(-6).map((turn: unknown) => {
          const t = turn as Record<string, unknown>
          if (t.role !== 'user' && t.role !== 'assistant') throw new HttpError(400, 'invalid', 'Invalid chat history.')
          return { role: t.role, content: str(t.content, 8000, 'Chat history', true)! }
        })
      : undefined,
    options: {
      length: length === 'short' || length === 'medium' || length === 'detailed' ? length : undefined,
      language,
      responseLanguage,
      count: Number.isFinite(Number(options.count)) ? Number(options.count) : undefined,
      target: target && TASKS.includes(target) ? target : undefined,
      partial: options.partial === true,
    },
  }
  if ((task === 'translate' || task === 'translate-selection') && !input.options.language) {
    throw new HttpError(400, 'invalid', 'Choose a target language.')
  }
  if (task === 'compare' && (!context.some((p) => p.doc === 'A') || !context.some((p) => p.doc === 'B'))) {
    throw new HttpError(400, 'invalid', 'Comparison needs text from both documents.')
  }
  return input
}

aiRouter.post(
  '/run',
  rateLimit('ai', config.ai.rateLimit),
  asyncHandler(async (req, res) => {
    const provider = getProvider()
    if (!provider) {
      throw new HttpError(503, 'ai_not_configured', aiConfigProblem() ?? 'AI is not configured on this server.')
    }
    const input = parseTaskInput(req.body)
    const prompt = buildPrompt(input)

    const controller = new AbortController()
    res.on('close', () => {
      if (!res.writableEnded) controller.abort()
    })

    const result = await provider.complete({
      system: prompt.system,
      messages: prompt.messages,
      maxTokens: Math.min(prompt.maxTokens ?? config.ai.maxOutputTokens, 8192),
      temperature: prompt.temperature,
      signal: controller.signal,
    })

    let data: unknown = null
    if (JSON_TASKS.has(input.task)) {
      data = parseJsonReply(result.text)
      if (data === null) {
        throw new HttpError(502, 'ai_bad_json', 'The AI response could not be read as structured data. Please try again.')
      }
    }
    res.json({
      task: input.task,
      text: JSON_TASKS.has(input.task) ? null : result.text,
      data,
      model: result.model,
      usage: { input: result.inputTokens ?? null, output: result.outputTokens ?? null },
    })
  }),
)
