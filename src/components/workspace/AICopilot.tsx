import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUp, Check, Copy, LoaderCircle, RotateCcw, Square, Trash2, TriangleAlert } from 'lucide-react'
import { Sparkle } from '../ui/Sparkle'
import { Markdown } from '../ai/Markdown'
import { StructuredResult, structuredToText } from '../ai/StructuredResult'
import { runDocumentTask, NoTextError, type AiResult, type AiTask } from '../../lib/ai/run'
import type { PageText } from '../../lib/ai/retrieval'
import { aiUnavailableReason, useServerStatus } from '../../hooks/useServerStatus'
import type { ViewerSelection } from '../viewer/PdfViewer'
import { readPref, writePref } from '../../lib/prefs'

type Message = {
  id: string
  role: 'user' | 'assistant'
  label: string
  task: AiTask
  result?: AiResult
  error?: string
  retry?: () => void
}

const ACTIONS: { task: AiTask; label: string; prompt: string }[] = [
  { task: 'summary', label: 'Summarize', prompt: 'Summarize this document' },
  { task: 'explain', label: 'Explain this document', prompt: 'Explain this document' },
  { task: 'keypoints', label: 'Key points', prompt: 'Extract the key points' },
  { task: 'dates', label: 'Dates & deadlines', prompt: 'Extract dates and deadlines' },
  { task: 'entities', label: 'Names & organizations', prompt: 'Extract names and organizations' },
  { task: 'notes', label: 'Study notes', prompt: 'Generate study notes' },
  { task: 'qa', label: 'Q&A', prompt: 'Generate questions and answers' },
]

const SUGGESTED = ['What is the main conclusion?', 'Who is this document for?', 'What are the obligations or next steps?']

export const LANGUAGES = ['English', 'Persian', 'Turkish', 'German', 'French', 'Spanish', 'Arabic', 'Russian', 'Chinese', 'Japanese', 'Italian', 'Portuguese']

// Chat history per document, kept for this browser session only.
const histories = new Map<string, Message[]>()

type AICopilotProps = {
  docKey: string | null
  docName: string
  text: { status: 'idle' | 'extracting' | 'ready' | 'error'; pages: PageText[] | null; done: number; total: number }
  locked: boolean
  selection: ViewerSelection | null
  onCite: (page: number) => void
}

function newId() {
  return Math.random().toString(36).slice(2)
}

function resultText(message: Message) {
  if (!message.result) return message.error ?? ''
  return message.result.text ?? structuredToText(message.task, message.result.data)
}

export function AICopilot({ docKey, docName, text, locked, selection, onCite }: AICopilotProps) {
  const inputId = useId()
  const server = useServerStatus()
  const unavailable = aiUnavailableReason(server)
  const [messages, setMessages] = useState<Message[]>(() => (docKey ? (histories.get(docKey) ?? []) : []))
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<{ stage: string; controller: AbortController } | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [length, setLength] = useState<'short' | 'medium' | 'detailed'>(() => readPref('summaryLength', 'medium'))
  const [replyLanguage, setReplyLanguage] = useState<string>(() => readPref('responseLanguage', 'auto'))
  const [translateTo, setTranslateTo] = useState<string>(() => readPref('translateTo', 'English'))
  const threadRef = useRef<HTMLDivElement>(null)

  // Switch history with the document; cancel any request that belonged to the previous one.
  useEffect(() => {
    setMessages(docKey ? (histories.get(docKey) ?? []) : [])
    setPending((current) => {
      current?.controller.abort()
      return null
    })
  }, [docKey])

  useEffect(() => {
    if (docKey) histories.set(docKey, messages)
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, docKey])

  useEffect(() => () => pending?.controller.abort(), [pending])

  const pages = text.pages
  const words = pages ? pages.reduce((sum, page) => sum + (page.text.match(/\S+/g)?.length ?? 0), 0) : 0
  const noText = text.status === 'ready' && words < 10
  const canRun = Boolean(docKey && pages && !noText && !unavailable && !pending && !locked)

  async function run(task: AiTask, label: string, extra: { question?: string; selection?: ViewerSelection } = {}) {
    if (!docKey || !pages || pending) return
    const forDoc = docKey
    const controller = new AbortController()
    const userMessage: Message = { id: newId(), role: 'user', label, task }
    const history = messages
      .filter((m) => m.task === 'ask' && (m.role === 'user' || m.result?.text))
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.role === 'user' ? m.label : (m.result?.text ?? '') }))
    setMessages((list) => [...list, userMessage])
    setPending({ stage: 'Starting…', controller })
    const attempt = () => run(task, label, extra)
    try {
      const result = await runDocumentTask({
        task,
        docName,
        pages,
        question: extra.question,
        selection: extra.selection,
        history: task === 'ask' ? history : undefined,
        options: {
          length,
          language: translateTo,
          responseLanguage: replyLanguage,
        },
        signal: controller.signal,
        onStage: (stage) => setPending((current) => (current && current.controller === controller ? { ...current, stage } : current)),
      })
      if (controller.signal.aborted) return
      const reply: Message = { id: newId(), role: 'assistant', label, task, result }
      const current = histories.get(forDoc) ?? []
      histories.set(forDoc, [...current, reply])
      setMessages((list) => (docKey === forDoc ? [...list, reply] : list))
    } catch (error) {
      if (controller.signal.aborted || (error as Error)?.name === 'AbortError') {
        setMessages((list) => [...list, { id: newId(), role: 'assistant', label, task, error: 'Cancelled.' }])
        return
      }
      const message =
        error instanceof NoTextError ? error.message : error instanceof Error ? error.message : 'The AI request failed.'
      setMessages((list) => [...list, { id: newId(), role: 'assistant', label, task, error: message, retry: attempt }])
    } finally {
      setPending((current) => (current?.controller === controller ? null : current))
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const value = draft.trim()
    if (!value || !canRun) return
    setDraft('')
    void run('ask', value, { question: value })
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  async function copy(message: Message) {
    try {
      await navigator.clipboard.writeText(resultText(message))
      setCopied(message.id)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }

  function clear() {
    pending?.controller.abort()
    setMessages([])
    if (docKey) histories.delete(docKey)
  }

  return (
    <aside className="copilot" aria-label="AI Copilot">
      <header className="copilot-head">
        <div>
          <h3>
            <Sparkle size={14} />
            AI Copilot
          </h3>
          <p>{server.health?.ai.configured ? `Answers from your document · ${server.health.ai.model}` : 'Ask anything about your document.'}</p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="icon-ghost" onClick={clear} aria-label="Clear conversation" title="Clear conversation">
            <Trash2 size={14} />
          </button>
        )}
      </header>

      {unavailable && (
        <div className="copilot-notice" role="status">
          <TriangleAlert size={14} aria-hidden="true" />
          <p>{unavailable}</p>
          <button type="button" className="chip" onClick={server.refresh}>
            Check again
          </button>
        </div>
      )}

      <div className="copilot-overview">
        <span>Overview</span>
        {!docKey ? (
          <p>Open a PDF to ask questions about it.</p>
        ) : locked ? (
          <p>Unlock the document in the viewer to use the Copilot.</p>
        ) : text.status === 'extracting' ? (
          <p className="typing">
            <LoaderCircle size={13} className="spin" /> Reading text… page {text.done} of {text.total}
          </p>
        ) : text.status === 'error' ? (
          <p>The text could not be read from this PDF.</p>
        ) : noText ? (
          <p>
            No selectable text found — this looks like a scanned document. Run{' '}
            <Link to="/tools/ocr-pdf">OCR PDF</Link> first, then open the result here.
          </p>
        ) : pages ? (
          <p>
            {pages.length} page{pages.length === 1 ? '' : 's'} · {words.toLocaleString()} words extracted. Text stays in your browser until you ask
            the Copilot something.
          </p>
        ) : (
          <p>Preparing…</p>
        )}
      </div>

      {selection && docKey && (
        <div className="copilot-selection">
          <span>Selected on page {selection.page}</span>
          <q>{selection.text.length > 160 ? `${selection.text.slice(0, 160)}…` : selection.text}</q>
          <div className="copilot-actions">
            <button type="button" className="chip" disabled={!canRun} onClick={() => run('explain-selection', `Explain: “${selection.text.slice(0, 80)}”`, { selection })}>
              Explain selection
            </button>
            <button type="button" className="chip" disabled={!canRun} onClick={() => run('translate-selection', `Translate to ${translateTo}: “${selection.text.slice(0, 80)}”`, { selection })}>
              Translate to {translateTo}
            </button>
          </div>
        </div>
      )}

      <div className="copilot-actions">
        {ACTIONS.map((action) => (
          <button key={action.task} type="button" className="chip" onClick={() => run(action.task, action.prompt)} disabled={!canRun}>
            {action.label}
          </button>
        ))}
      </div>

      <details className="copilot-settings">
        <summary>Response settings</summary>
        <label>
          Summary length
          <select
            value={length}
            onChange={(event) => {
              const value = event.target.value as typeof length
              setLength(value)
              writePref('summaryLength', value)
            }}
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="detailed">Detailed</option>
          </select>
        </label>
        <label>
          Reply in
          <select
            value={replyLanguage}
            onChange={(event) => {
              setReplyLanguage(event.target.value)
              writePref('responseLanguage', event.target.value)
            }}
          >
            <option value="auto">Document / question language</option>
            {LANGUAGES.map((lang) => (
              <option key={lang}>{lang}</option>
            ))}
          </select>
        </label>
        <label>
          Translate to
          <select
            value={translateTo}
            onChange={(event) => {
              setTranslateTo(event.target.value)
              writePref('translateTo', event.target.value)
            }}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang}>{lang}</option>
            ))}
          </select>
        </label>
      </details>

      <div className="copilot-thread" ref={threadRef} aria-live="polite" aria-busy={Boolean(pending)}>
        {messages.length === 0 && !pending ? (
          <div className="copilot-empty">
            <p>Try a suggested action, or ask a question below.</p>
            {canRun && (
              <div className="copilot-actions">
                {SUGGESTED.map((question) => (
                  <button key={question} type="button" className="chip" onClick={() => run('ask', question, { question })}>
                    {question}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((message) =>
            message.role === 'user' ? (
              <div key={message.id} className="bubble is-user">
                {message.label}
              </div>
            ) : (
              <div key={message.id} className={`bubble is-assistant ${message.error ? 'is-error' : ''}`}>
                {message.error ? (
                  <>
                    <p>{message.error}</p>
                    {message.retry && (
                      <button type="button" className="chip" onClick={message.retry} disabled={!canRun}>
                        <RotateCcw size={12} /> Retry
                      </button>
                    )}
                  </>
                ) : message.result ? (
                  <>
                    {message.result.text !== null ? (
                      <Markdown text={message.result.text} onCite={onCite} />
                    ) : (
                      <StructuredResult task={message.task} data={message.result.data} onCite={onCite} />
                    )}
                    {message.result.sources.length > 0 && (
                      <details className="bubble-sources">
                        <summary>Passages used ({message.result.sources.length})</summary>
                        <ul>
                          {message.result.sources.map((source) => (
                            <li key={source.page}>
                              <button type="button" className="cite" onClick={() => onCite(source.page)}>
                                p. {source.page}
                              </button>{' '}
                              {source.excerpt}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {message.result.note && <p className="bubble-note">{message.result.note}</p>}
                    <div className="bubble-tools">
                      <button type="button" className="icon-ghost" onClick={() => copy(message)} aria-label="Copy response">
                        {copied === message.id ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                      <span>AI-generated from your document — verify important details.</span>
                    </div>
                  </>
                ) : null}
              </div>
            ),
          )
        )}
        {pending && (
          <div className="bubble is-assistant">
            <span className="typing">
              <LoaderCircle size={14} className="spin" />
              {pending.stage}
            </span>
            <button type="button" className="chip" onClick={() => pending.controller.abort()}>
              <Square size={11} /> Stop
            </button>
          </div>
        )}
      </div>

      <form className="copilot-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor={inputId}>
          Ask anything about this PDF
        </label>
        <textarea
          id={inputId}
          rows={1}
          value={draft}
          maxLength={2000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={docKey ? 'Ask anything about this PDF...' : 'Open a PDF first'}
          disabled={!canRun && !pending}
        />
        <button className="icon-btn" type="submit" aria-label="Send question" disabled={!draft.trim() || !canRun}>
          <ArrowUp size={16} />
        </button>
      </form>
    </aside>
  )
}
