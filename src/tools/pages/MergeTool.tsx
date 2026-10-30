import { useEffect, useRef, useState, type DragEvent } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Lock, X } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop, type AcceptedFile } from '../../components/tools/FileDrop'
import { PageThumb } from '../../components/tools/PageThumb'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton } from '../../components/tools/controls'
import { usePdfSource, type PdfSource } from '../../hooks/usePdfSource'
import { useToolRun } from '../../hooks/useToolRun'
import { useDocuments } from '../../state/DocumentsContext'
import { mergePdfs } from '../../lib/pdf/pages'
import { toBlob } from '../../lib/files'
import { formatBytes, LIMITS } from '../../config/limits'

type Entry = { id: string; file: File }

let counter = 0
const nextId = () => `f${++counter}`

function MergeItem({
  entry,
  index,
  total,
  onRemove,
  onMove,
  onSource,
  dragProps,
}: {
  entry: Entry
  index: number
  total: number
  onRemove: () => void
  onMove: (to: number) => void
  onSource: (id: string, source: PdfSource) => void
  dragProps: Record<string, unknown>
}) {
  const { source, submitPassword } = usePdfSource(entry.file)
  const [password, setPassword] = useState('')
  useEffect(() => onSource(entry.id, source), [entry.id, source, onSource])

  return (
    <li className="merge-item" {...dragProps}>
      <span className="merge-grip" aria-hidden="true">
        <GripVertical size={16} />
      </span>
      <span className="merge-index">{index + 1}</span>
      <div className="merge-thumb">
        {source.status === 'ready' ? <PageThumb doc={source.doc} pageNumber={1} width={52} /> : <span className="page-thumb" style={{ width: 52 }} />}
      </div>
      <div className="merge-meta">
        <strong>{entry.file.name}</strong>
        <em>
          {formatBytes(entry.file.size)}
          {source.status === 'ready' && ` · ${source.pageCount} pages`}
          {source.status === 'loading' && ' · reading…'}
        </em>
        {source.status === 'error' && <span className="field-error">{source.error}</span>}
        {source.status === 'password' && (
          <form
            className="password-row is-inline"
            onSubmit={(event) => {
              event.preventDefault()
              if (password) submitPassword(password)
            }}
          >
            <Lock size={13} aria-hidden="true" />
            <label className="sr-only" htmlFor={`pw-${entry.id}`}>
              Password for {entry.file.name}
            </label>
            <input id={`pw-${entry.id}`} type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="submit" className="chip" disabled={!password}>
              Unlock
            </button>
            {source.wrong && <span className="field-error">Incorrect.</span>}
          </form>
        )}
      </div>
      <div className="merge-actions">
        <button type="button" className="icon-ghost" aria-label={`Move ${entry.file.name} up`} disabled={index === 0} onClick={() => onMove(index - 1)}>
          <ArrowUp size={15} />
        </button>
        <button type="button" className="icon-ghost" aria-label={`Move ${entry.file.name} down`} disabled={index === total - 1} onClick={() => onMove(index + 1)}>
          <ArrowDown size={15} />
        </button>
        <button type="button" className="icon-ghost" aria-label={`Remove ${entry.file.name}`} onClick={onRemove}>
          <X size={15} />
        </button>
      </div>
    </li>
  )
}

export default function MergeTool({ docIds }: ToolProps) {
  const documents = useDocuments()
  const [entries, setEntries] = useState<Entry[]>([])
  const sources = useRef(new Map<string, PdfSource>())
  const [, force] = useState(0)
  const [dragId, setDragId] = useState<string | null>(null)
  const run = useToolRun()

  // Preload documents chosen in the workspace (?docs=a,b,c).
  useEffect(() => {
    if (docIds.length === 0 || documents.loading) return
    let cancelled = false
    ;(async () => {
      const files: Entry[] = []
      for (const id of docIds) {
        const meta = documents.docs.find((doc) => doc.id === id)
        const blob = await documents.getBlob(id)
        if (meta && blob) files.push({ id: nextId(), file: new File([blob], meta.name, { type: 'application/pdf' }) })
      }
      if (!cancelled && files.length) setEntries(files)
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docIds.join(','), documents.loading])

  const onSource = useRef((id: string, source: PdfSource) => {
    sources.current.set(id, source)
    force((n) => n + 1)
  }).current

  function add(files: AcceptedFile[]) {
    run.reset()
    setEntries((list) => [...list, ...files.map(({ file }) => ({ id: nextId(), file }))].slice(0, LIMITS.maxFiles))
  }

  function move(from: number, to: number) {
    setEntries((list) => {
      if (to < 0 || to >= list.length) return list
      const next = [...list]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const states = entries.map((entry) => sources.current.get(entry.id))
  const allReady = entries.length >= 2 && states.every((s) => s?.status === 'ready')
  const totalPages = states.reduce((sum, s) => sum + (s?.status === 'ready' ? s.pageCount : 0), 0)

  function merge() {
    const ready = entries.map((entry) => sources.current.get(entry.id))
    void run.start(async ({ processing }) => {
      processing(`Merging ${entries.length} files…`)
      const inputs = ready.map((s) => {
        if (s?.status !== 'ready') throw new Error('Every file must be opened before merging.')
        return { bytes: s.bytes, password: s.password }
      })
      const bytes = await mergePdfs(inputs)
      return {
        outputs: [{ name: 'merged.pdf', blob: toBlob(bytes, 'application/pdf'), note: `${totalPages} pages` }],
        summary: `Merged ${entries.length} files into one ${totalPages}-page PDF.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) {
    return <ResultPanel result={run.result} onReset={() => { run.reset(); setEntries([]) }} resetLabel="Merge other files" />
  }

  return (
    <div className="tool-stack">
      {entries.length === 0 ? (
        <FileDrop accepts={['pdf']} multiple onFiles={add} label="Select PDF files" />
      ) : (
        <>
          <ol className="merge-list" aria-label="Files to merge, in order">
            {entries.map((entry, index) => (
              <MergeItem
                key={entry.id}
                entry={entry}
                index={index}
                total={entries.length}
                onRemove={() => setEntries((list) => list.filter((e) => e.id !== entry.id))}
                onMove={(to) => move(index, to)}
                onSource={onSource}
                dragProps={{
                  draggable: true,
                  className: `merge-item ${dragId === entry.id ? 'is-dragging' : ''}`,
                  onDragStart: (event: DragEvent) => {
                    setDragId(entry.id)
                    event.dataTransfer.effectAllowed = 'move'
                    event.dataTransfer.setData('text/plain', entry.id)
                  },
                  onDragOver: (event: DragEvent) => {
                    if (dragId) event.preventDefault()
                  },
                  onDrop: (event: DragEvent) => {
                    event.preventDefault()
                    const from = entries.findIndex((e) => e.id === dragId)
                    if (from >= 0) move(from, index)
                    setDragId(null)
                  },
                  onDragEnd: () => setDragId(null),
                }}
              />
            ))}
          </ol>
          <FileDrop accepts={['pdf']} multiple compact onFiles={add} label="Add more PDFs" />
          {entries.length < 2 && <p className="muted">Add at least one more PDF to merge.</p>}
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={merge} />
          <RunButton disabled={!allReady || run.busy} onClick={merge}>
            Merge {entries.length} PDFs{totalPages ? ` (${totalPages} pages)` : ''}
          </RunButton>
        </>
      )}
    </div>
  )
}
