import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, ChevronRight, Copy, Download, RotateCcw, Shuffle, TriangleAlert } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { Field, RunButton, Segmented, checkRange } from '../../components/tools/controls'
import { Markdown } from '../../components/ai/Markdown'
import { StructuredResult, flashcardsToCsv, structuredToText } from '../../components/ai/StructuredResult'
import { LANGUAGES } from '../../components/workspace/AICopilot'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { usePdfSource } from '../../hooks/usePdfSource'
import { useToolRun } from '../../hooks/useToolRun'
import { aiUnavailableReason, useServerStatus } from '../../hooks/useServerStatus'
import { runDocumentTask, type AiOptions, type AiResult, type AiTask } from '../../lib/ai/run'
import { extractText, type PageText, type PDFDocumentProxy } from '../../lib/pdf/pdfjs'
import { baseName, downloadBlob } from '../../lib/files'
import { useDocuments } from '../../state/DocumentsContext'
import { readPref } from '../../lib/prefs'

type Done = { task: AiTask; result: AiResult; docName: string }

async function readPages(doc: PDFDocumentProxy, indices: number[] | null, progress: (done: number, total: number) => void, signal: AbortSignal) {
  const all = await extractText(doc, progress, signal)
  return indices ? all.filter((p) => indices.includes(p.page - 1)) : all
}

function AiNotice() {
  const server = useServerStatus()
  const reason = aiUnavailableReason(server)
  if (!reason) return null
  return (
    <div className="tool-notice" role="status">
      <TriangleAlert size={16} aria-hidden="true" />
      <p>{reason}</p>
      <button type="button" className="chip" onClick={server.refresh}>
        Check again
      </button>
    </div>
  )
}

function useAiReady() {
  const server = useServerStatus()
  return !server.loading && !aiUnavailableReason(server)
}

function ResultView({ done, onReset, extra }: { done: Done; onReset: () => void; extra?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  const text = done.result.text ?? structuredToText(done.task, done.result.data)
  const stem = baseName(done.docName)
  return (
    <section className="ai-result" aria-label="AI result">
      <header>
        <h2>Result</h2>
        <div className="tool-actions">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(text)
                setCopied(true)
                window.setTimeout(() => setCopied(false), 1600)
              } catch {
                setCopied(false)
              }
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadBlob(new Blob([text], { type: 'text/markdown;charset=utf-8' }), `${stem}-${done.task}.md`)}>
            <Download size={14} /> Markdown
          </button>
          {done.result.data !== null && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => downloadBlob(new Blob([JSON.stringify(done.result.data, null, 2)], { type: 'application/json' }), `${stem}-${done.task}.json`)}>
              <Download size={14} /> JSON
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={onReset}>
            <RotateCcw size={14} /> New run
          </button>
        </div>
      </header>
      {extra}
      <div className="ai-result-body">
        {done.result.text !== null ? <Markdown text={done.result.text} /> : <StructuredResult task={done.task} data={done.result.data} />}
      </div>
      <p className="muted">
        AI-generated from the document’s text with {done.result.model}
        {done.result.note ? ` · ${done.result.note}` : ''}. Verify important details against the source pages.
      </p>
    </section>
  )
}

type Config = {
  task: AiTask | ((choice: string) => AiTask)
  options?: (state: { length: AiOptions['length']; language: string; count: number; choice: string }) => AiOptions
  controls?: (props: {
    length: AiOptions['length']
    setLength: (v: AiOptions['length']) => void
    language: string
    setLanguage: (v: string) => void
    count: number
    setCount: (v: number) => void
    choice: string
    setChoice: (v: string) => void
  }) => ReactNode
  runLabel: string
  defaultChoice?: string
  renderExtra?: (done: Done) => ReactNode
}

/** Shared flow for single-document AI tools. */
function AiDocTool({ docIds, config }: ToolProps & { config: Config }) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const ready = useAiReady()
  const [length, setLength] = useState<AiOptions['length']>(() => readPref('summaryLength', 'medium') as AiOptions['length'])
  const [language, setLanguage] = useState<string>(() => readPref('translateTo', 'English'))
  const [count, setCount] = useState(12)
  const [choice, setChoice] = useState(config.defaultChoice ?? '')
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('1-10')
  const [done, setDone] = useState<Done | null>(null)
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const parsed = scope === 'range' && pageCount ? checkRange(range, pageCount) : null

  function go() {
    if (source.status !== 'ready') return
    const doc = source.doc
    const name = source.file.name
    const task = typeof config.task === 'function' ? config.task(choice) : config.task
    setDone(null)
    void run.start(async ({ progress, signal }) => {
      const pages: PageText[] = await readPages(doc, scope === 'range' ? (parsed?.indices ?? []) : null, (d, t) => progress({ done: d, total: t, label: 'Extracting text…' }), signal)
      const result = await runDocumentTask({
        task,
        docName: name,
        pages,
        options: config.options ? config.options({ length, language, count, choice }) : { responseLanguage: readPref('responseLanguage', 'auto') },
        signal,
        onStage: (stage) => progress({ label: stage }),
      })
      setDone({ task, result, docName: name })
      return { outputs: [], summary: 'Done' }
    })
  }

  if (done && run.phase === 'success') {
    return <ResultView done={done} onReset={() => { setDone(null); run.reset() }} extra={config.renderExtra?.(done)} />
  }

  return (
    <div className="tool-stack">
      <AiNotice />
      {!file ? (
        <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />
      ) : (
        <>
          <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
          {source.status === 'ready' && (
            <>
              <div className="tool-options">
                {config.controls?.({ length, setLength, language, setLanguage, count, setCount, choice, setChoice })}
                <Segmented label="Pages" value={scope} onChange={setScope} options={[{ value: 'all', label: `All ${pageCount}` }, { value: 'range', label: 'Page range' }]} />
                {scope === 'range' && (
                  <Field label="Pages" error={parsed?.error}>
                    <input value={range} onChange={(e) => setRange(e.target.value)} />
                  </Field>
                )}
              </div>
              <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={go} />
              <RunButton disabled={!ready || run.busy || Boolean(parsed?.error)} onClick={go}>
                {config.runLabel}
              </RunButton>
            </>
          )}
        </>
      )}
    </div>
  )
}

function LanguageSelect({ value, onChange, label = 'Target language' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <Field label={label}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {LANGUAGES.map((lang) => (
          <option key={lang}>{lang}</option>
        ))}
      </select>
    </Field>
  )
}

function FlashcardReview({ data }: { data: unknown }) {
  const cards = ((data as { cards?: { front?: string; back?: string; page?: number }[] })?.cards ?? []).filter((c) => c.front)
  const [order, setOrder] = useState(() => cards.map((_, i) => i))
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  if (cards.length === 0) return null
  const card = cards[order[index]]
  return (
    <div className="flashcards">
      <button type="button" className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((f) => !f)} aria-label={flipped ? 'Show question' : 'Show answer'}>
        <span className="flashcard-side">{flipped ? 'Answer' : 'Question'}</span>
        <strong dir="auto">{flipped ? card.back : card.front}</strong>
        {flipped && card.page ? <em>p. {card.page}</em> : <em>Click to flip</em>}
      </button>
      <div className="flashcard-nav">
        <button type="button" className="icon-ghost" aria-label="Previous card" disabled={index === 0} onClick={() => { setIndex((i) => i - 1); setFlipped(false) }}>
          <ChevronLeft size={16} />
        </button>
        <span>
          {index + 1} / {cards.length}
        </span>
        <button type="button" className="icon-ghost" aria-label="Next card" disabled={index === cards.length - 1} onClick={() => { setIndex((i) => i + 1); setFlipped(false) }}>
          <ChevronRight size={16} />
        </button>
        <button type="button" className="chip" onClick={() => { setOrder((o) => [...o].sort(() => Math.random() - 0.5)); setIndex(0); setFlipped(false) }}>
          <Shuffle size={12} /> Shuffle
        </button>
        <button type="button" className="chip" onClick={() => downloadBlob(new Blob([flashcardsToCsv(data)], { type: 'text/csv;charset=utf-8' }), 'flashcards-anki.csv')}>
          <Download size={12} /> CSV for Anki
        </button>
      </div>
    </div>
  )
}

const lengthControl: Config['controls'] = ({ length, setLength }) => (
  <Segmented label="Length" value={length ?? 'medium'} onChange={setLength} options={[{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'detailed', label: 'Detailed' }]} />
)

const countControl = (label: string): Config['controls'] => ({ count, setCount }) => (
  <Field label={`${label}: ${count}`}>
    <input type="range" min={5} max={30} value={count} onChange={(e) => setCount(Number(e.target.value))} />
  </Field>
)

const replyIn = () => ({ responseLanguage: readPref('responseLanguage', 'auto') })

export const SummarizerTool = (props: ToolProps) => (
  <AiDocTool {...props} config={{ task: 'summary', runLabel: 'Summarize', controls: lengthControl, options: ({ length }) => ({ length, ...replyIn() }) }} />
)

export const TranslateTool = (props: ToolProps) => (
  <AiDocTool
    {...props}
    config={{
      task: 'translate',
      runLabel: 'Translate',
      controls: ({ language, setLanguage }) => <LanguageSelect value={language} onChange={setLanguage} />,
      options: ({ language }) => ({ language }),
    }}
  />
)

export const ExtractTool = (props: ToolProps) => (
  <AiDocTool
    {...props}
    config={{
      task: (choice) => (choice === 'dates' ? 'dates' : choice === 'entities' ? 'entities' : 'extract'),
      defaultChoice: 'extract',
      runLabel: 'Extract information',
      controls: ({ choice, setChoice }) => (
        <Segmented
          label="What to extract"
          value={choice}
          onChange={setChoice}
          options={[
            { value: 'extract', label: 'Key fields' },
            { value: 'dates', label: 'Dates & deadlines' },
            { value: 'entities', label: 'People & organizations' },
          ]}
        />
      ),
      options: replyIn,
    }}
  />
)

export const StudyGuideTool = (props: ToolProps) => <AiDocTool {...props} config={{ task: 'study-guide', runLabel: 'Create study guide', options: replyIn }} />

export const FlashcardsTool = (props: ToolProps) => (
  <AiDocTool
    {...props}
    config={{
      task: 'flashcards',
      runLabel: 'Generate flashcards',
      controls: countControl('Number of cards'),
      options: ({ count }) => ({ count, ...replyIn() }),
      renderExtra: (done) => <FlashcardReview data={done.result.data} />,
    }}
  />
)

export const QaTool = (props: ToolProps) => (
  <AiDocTool {...props} config={{ task: 'qa', runLabel: 'Generate questions', controls: countControl('Number of questions'), options: ({ count }) => ({ count, ...replyIn() }) }} />
)

export const ReportTool = (props: ToolProps) => <AiDocTool {...props} config={{ task: 'report', runLabel: 'Extract decisions & actions', options: replyIn }} />

/** "Ask your PDF" lives in the workspace, where the Copilot keeps a chat next to the document. */
export function AskTool(_props: ToolProps) {
  const documents = useDocuments()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="tool-stack">
      <AiNotice />
      <p className="muted">Your PDF opens in the workspace with the AI Copilot beside it. Ask questions, click page citations to jump to the source, and select text to have it explained or translated.</p>
      <FileDrop
        accepts={['pdf']}
        onFiles={async ([f]) => {
          const { added, errors } = await documents.addFiles([f.file])
          if (added[0]) navigate('/workspace', { state: { openId: added[0].id } })
          else setError(errors[0] ?? 'The PDF could not be opened.')
        }}
        label="Open a PDF and ask"
      />
      {error && <p className="tool-errors">{error}</p>}
    </div>
  )
}

export function AiCompareTool(_props: ToolProps) {
  const [fileA, setFileA] = useState<File | null>(null)
  const [fileB, setFileB] = useState<File | null>(null)
  const a = usePdfSource(fileA)
  const b = usePdfSource(fileB)
  const run = useToolRun()
  const ready = useAiReady()
  const [done, setDone] = useState<Done | null>(null)

  useEffect(() => setDone(null), [fileA, fileB])

  function go() {
    if (a.source.status !== 'ready' || b.source.status !== 'ready') return
    const docA = a.source.doc
    const docB = b.source.doc
    const nameA = a.source.file.name
    const nameB = b.source.file.name
    void run.start(async ({ progress, signal }) => {
      const pagesA = await extractText(docA, (d, t) => progress({ done: d, total: t, label: 'Reading document A…' }), signal)
      const pagesB = await extractText(docB, (d, t) => progress({ done: d, total: t, label: 'Reading document B…' }), signal)
      const result = await runDocumentTask({ task: 'compare', docName: nameA, pages: pagesA, docB: { name: nameB, pages: pagesB }, options: replyIn(), signal, onStage: (stage) => progress({ label: stage }) })
      setDone({ task: 'compare', result, docName: `${baseName(nameA)}-vs-${baseName(nameB)}` })
      return { outputs: [], summary: 'Done' }
    })
  }

  if (done && run.phase === 'success') return <ResultView done={done} onReset={() => { setDone(null); run.reset() }} />

  return (
    <div className="tool-stack">
      <AiNotice />
      <div className="compare-inputs">
        <div>
          <h2 className="compare-label">Document A</h2>
          {fileA ? <PdfFileBar source={a.source} onClear={() => setFileA(null)} onPassword={a.submitPassword} /> : <FileDrop accepts={['pdf']} compact onFiles={([f]) => setFileA(f.file)} label="Choose PDF A" />}
        </div>
        <div>
          <h2 className="compare-label">Document B</h2>
          {fileB ? <PdfFileBar source={b.source} onClear={() => setFileB(null)} onPassword={b.submitPassword} /> : <FileDrop accepts={['pdf']} compact onFiles={([f]) => setFileB(f.file)} label="Choose PDF B" />}
        </div>
      </div>
      {a.source.status === 'ready' && b.source.status === 'ready' && (
        <>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={go} />
          <RunButton disabled={!ready || run.busy} onClick={go}>
            Compare with AI
          </RunButton>
        </>
      )}
    </div>
  )
}
