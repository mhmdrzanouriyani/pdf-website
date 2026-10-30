import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MousePointer2, Square, Trash2 } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton } from '../../components/tools/controls'
import { PageEditor, newElementId, type EditorTool } from '../../components/editor/PageEditor'
import { useEditorHistory } from '../../components/editor/useEditorHistory'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { findTextRegions, redactPdf } from '../../lib/pdf/redact'
import type { EditorElement } from '../../lib/pdf/annotate'
import { toBlob, withSuffix } from '../../lib/files'
import { useToast } from '../../state/ToastContext'

const STYLE = { color: '#000000', strokeWidth: 1, fontSize: 12, fill: '#000000', opacity: 0.85 }

export default function RedactTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const { notify } = useToast()
  const history = useEditorHistory()
  const [tool, setTool] = useState<EditorTool>('rect')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [terms, setTerms] = useState<string[]>([])
  const [dpi, setDpi] = useState('200')
  const [searching, setSearching] = useState(false)
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const regions = history.elements.filter((el) => el.kind === 'rect')
  const affectedPages = new Set(regions.map((r) => r.page))

  useEffect(() => {
    history.reset()
    setTerms([])
    setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  async function markAll() {
    if (source.status !== 'ready' || !query.trim()) return
    setSearching(true)
    try {
      const found = await findTextRegions(source.doc, query.trim())
      if (found.length === 0) {
        notify(`“${query}” was not found in the document’s text.`, 'info')
        return
      }
      const added: EditorElement[] = found.map((r) => ({ id: newElementId(), page: r.page, kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h, ...STYLE }))
      history.change([...history.elements, ...added], true)
      setTerms((t) => [...new Set([...t, query.trim()])])
      notify(`Marked ${found.length} occurrence${found.length === 1 ? '' : 's'} on ${new Set(found.map((r) => r.page)).size} page(s).`, 'success')
      setPage(found[0].page)
      setQuery('')
    } finally {
      setSearching(false)
    }
  }

  function apply() {
    if (source.status !== 'ready') return
    void run.start(async ({ progress, signal }) => {
      const result = await redactPdf(
        source.bytes,
        source.doc,
        regions.map((r) => ({ page: r.page, x: r.x, y: r.y, w: r.w, h: r.h })),
        { dpi: Number(dpi), password: source.password, terms, signal, onProgress: (done, total) => progress({ done, total, label: 'Flattening redacted pages…' }) },
      )
      const leaked = result.verifiedTerms.filter((t) => t.remaining > 0)
      return {
        outputs: [{ name: withSuffix(source.file.name, '-redacted', 'pdf'), blob: toBlob(result.bytes, 'application/pdf') }],
        summary: `Redacted ${regions.length} area${regions.length === 1 ? '' : 's'} on ${result.pages.length} page${result.pages.length === 1 ? '' : 's'}.`,
        details: [
          `Pages ${result.pages.map((p) => p + 1).join(', ')} were replaced by flattened images, so the content under the black boxes is permanently removed. Text on those pages is no longer selectable.`,
          ...result.verifiedTerms.map((t) =>
            t.remaining === 0 ? `Verified: “${t.term}” no longer appears in the file’s text.` : `Warning: “${t.term}” still appears ${t.remaining} time(s) — likely on pages without a redaction box. Review before sharing.`,
          ),
          leaked.length === 0 ? 'Bookmarks and document metadata are not changed; check them with PDF Metadata if they could contain sensitive data.' : '',
        ].filter(Boolean),
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Redact more" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <form
            className="redact-search"
            onSubmit={(event) => {
              event.preventDefault()
              void markAll()
            }}
          >
            <Field label="Find text to redact" hint="Marks every occurrence (case-insensitive). You can also draw boxes by hand.">
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. a name, email or account number" />
            </Field>
            <button type="submit" className="btn btn-outline btn-md" disabled={!query.trim() || searching}>
              {searching ? 'Searching…' : 'Mark all'}
            </button>
          </form>
          <div className="editor-toolbar" role="toolbar" aria-label="Redaction tools">
            <div className="editor-tools">
              <button type="button" aria-pressed={tool === 'rect'} onClick={() => setTool('rect')} aria-label="Draw redaction box" title="Draw redaction box">
                <Square size={16} />
              </button>
              <button type="button" aria-pressed={tool === 'select'} onClick={() => setTool('select')} aria-label="Select and move boxes" title="Select & move">
                <MousePointer2 size={16} />
              </button>
              <button type="button" disabled={!selectedId} onClick={() => { history.change(history.elements.filter((el) => el.id !== selectedId), true); setSelectedId(null) }} aria-label="Remove selected box" title="Remove box">
                <Trash2 size={16} />
              </button>
            </div>
            <span className="muted">
              {regions.length} box{regions.length === 1 ? '' : 'es'} on {affectedPages.size} page{affectedPages.size === 1 ? '' : 's'}
            </span>
          </div>
          <div className="editor-pager">
            <button type="button" className="icon-ghost" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page + 1} of {pageCount}
              {affectedPages.has(page) ? ' · has redactions' : ''}
            </span>
            <button type="button" className="icon-ghost" aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
          <PageEditor doc={source.doc} page={page} elements={history.elements} onChange={history.change} tool={tool} style={STYLE} selectedId={selectedId} onSelect={setSelectedId} />
          <div className="tool-options">
            <Field label="Output resolution for redacted pages">
              <select value={dpi} onChange={(e) => setDpi(e.target.value)}>
                <option value="150">150 dpi — smaller file</option>
                <option value="200">200 dpi — recommended</option>
                <option value="300">300 dpi — print quality</option>
              </select>
            </Field>
          </div>
          <p className="tool-notice is-info">
            Redaction is permanent: pages with boxes are converted to images and the covered content is deleted from the file. Keep your original if you might need it.
          </p>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={apply} />
          <RunButton disabled={regions.length === 0 || run.busy} onClick={apply}>
            Apply redaction
          </RunButton>
        </>
      )}
    </div>
  )
}
