import { config } from '../config.ts'
import { HttpError } from '../lib/http.ts'

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

export type CompletionRequest = {
  system: string
  messages: ChatMessage[]
  maxTokens: number
  temperature?: number
  signal?: AbortSignal
}

export type CompletionResult = { text: string; model: string; inputTokens?: number; outputTokens?: number }

export interface AIProvider {
  readonly name: string
  readonly model: string
  complete(request: CompletionRequest): Promise<CompletionResult>
}

function withTimeout(signal: AbortSignal | undefined) {
  const timeout = AbortSignal.timeout(config.ai.timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as { error?: { message?: string; type?: string } | string }
    if (typeof body.error === 'string') return body.error
    return body.error?.message ?? ''
  } catch {
    return ''
  }
}

function mapProviderStatus(status: number, detail: string): never {
  // Provider messages can contain account details; only expose generic text plus status.
  console.warn(`[pdfly] AI provider error ${status}: ${detail.slice(0, 300)}`)
  if (status === 401 || status === 403) throw new HttpError(502, 'ai_auth', 'The AI provider rejected the API key. Check the server configuration.')
  if (status === 404) throw new HttpError(502, 'ai_model', 'The configured AI model was not found. Check AI_MODEL.')
  if (status === 429) throw new HttpError(429, 'ai_rate_limited', 'The AI provider is rate limiting requests. Please wait a moment and try again.')
  if (status === 400 || status === 413) throw new HttpError(422, 'ai_rejected', 'The AI provider could not process this request (the document section may be too long).')
  if (status >= 500) throw new HttpError(502, 'ai_unavailable', 'The AI provider is temporarily unavailable. Please try again.')
  throw new HttpError(502, 'ai_error', `The AI provider returned an error (${status}).`)
}

function wrapFetchError(error: unknown): never {
  if (error instanceof HttpError) throw error
  const name = (error as { name?: string })?.name
  if (name === 'TimeoutError') throw new HttpError(504, 'ai_timeout', 'The AI provider took too long to respond. Try a shorter document section.')
  if (name === 'AbortError') throw new HttpError(499, 'cancelled', 'The request was cancelled.')
  throw new HttpError(502, 'ai_network', 'Could not reach the AI provider from the server.')
}

class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic'
  readonly model: string
  private readonly apiKey: string
  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey
    this.model = model
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    let response: Response
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0.2,
          system: request.system,
          messages: request.messages,
        }),
        signal: withTimeout(request.signal),
      })
    } catch (error) {
      wrapFetchError(error)
    }
    if (!response.ok) mapProviderStatus(response.status, await readError(response))
    const data = (await response.json()) as {
      content?: { type: string; text?: string }[]
      model?: string
      usage?: { input_tokens?: number; output_tokens?: number }
    }
    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text ?? '')
      .join('')
      .trim()
    if (!text) throw new HttpError(502, 'ai_empty', 'The AI provider returned an empty response.')
    return { text, model: data.model ?? this.model, inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }
  }
}

/** Works with OpenAI and any OpenAI-compatible endpoint (Azure-style proxies, OpenRouter, Ollama, LM Studio…). */
class OpenAICompatibleProvider implements AIProvider {
  readonly name = 'openai-compatible'
  readonly model: string
  private readonly apiKey: string
  private readonly baseUrl: string
  constructor(apiKey: string, baseUrl: string, model: string) {
    this.apiKey = apiKey
    this.baseUrl = baseUrl
    this.model = model
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxTokens,
          temperature: request.temperature ?? 0.2,
          messages: [{ role: 'system', content: request.system }, ...request.messages],
        }),
        signal: withTimeout(request.signal),
      })
    } catch (error) {
      wrapFetchError(error)
    }
    if (!response.ok) mapProviderStatus(response.status, await readError(response))
    const data = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
      model?: string
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!text) throw new HttpError(502, 'ai_empty', 'The AI provider returned an empty response.')
    return { text, model: data.model ?? this.model, inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens }
  }
}

let cached: AIProvider | null | undefined

export function getProvider(): AIProvider | null {
  if (cached !== undefined) return cached
  const ai = config.ai
  if (ai.provider === 'anthropic' && ai.anthropicKey && ai.model) cached = new AnthropicProvider(ai.anthropicKey, ai.model)
  else if (ai.provider === 'openai' && ai.model) cached = new OpenAICompatibleProvider(ai.openaiKey, ai.openaiBaseUrl, ai.model)
  else cached = null
  return cached
}

/** Test hook: replace the provider (used by unit tests with a fake). */
export function setProviderForTests(provider: AIProvider | null) {
  cached = provider
}
