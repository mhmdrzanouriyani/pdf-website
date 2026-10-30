import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, MousePointer2, Signature, Trash2, Type } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented, checkRange } from '../../components/tools/controls'
import { PageEditor, type EditorTool, type PendingImage } from '../../components/editor/PageEditor'
import { SignatureCreator } from '../../components/editor/SignatureCreator'
import { useEditorHistory } from '../../components/editor/useEditorHistory'
import { prepareForExport } from '../../components/editor/prepareExport'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { applyElements, type EditorElement } from '../../lib/pdf/annotate'
import { toBlob, withSuffix } from '../../lib/files'

export default function SignTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const history = useEditorHistory()
  const [signature, setSignature] = useState<PendingImage | null>(null)
  const [tool, setTool] = useState<EditorTool>('select')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [repeat, setRepeat] = useState<'placed' | 'all' | 'range'>('placed')
  const [range, setRange] = useState('')
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const parsed = repeat === 'range' && pageCount ? checkRange(range, pageCount) : null

  useEffect(() => {
    history.reset()
    setPage(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        history.change(history.elements.filter((el) => el.id !== selectedId), true)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, selectedId])

  /** Copies signatures placed on one page to the other chosen pages, at the same position. */
  function expand(elements: EditorElement[]): EditorElement[] {
    if (repeat === 'placed') return elements
    const targets = repeat === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : (parsed?.indices ?? [])
    const signatures = elements.filter((el) => el.kind === 'image')
    const others = elements.filter((el) => el.kind !== 'image')
    const copies = targets.flatMap((target) => signatures.map((el) => ({ ...el, id: `${el.id}-${target}`, page: target })))
    // De-duplicate identical page/position pairs.
    const seen = new Set<string>()
    return [...others, ...copies].filter((el) => {
      const key = `${el.id.split('-')[0]}:${el.page}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  function save() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Applying signature…')
      const elements = await prepareForExport(expand(history.elements))
      const bytes = await applyElements(source.bytes, elements, source.password)
      const pages = new Set(elements.map((el) => el.page)).size
      return {
        outputs: [{ name: withSuffix(source.file.name, '-signed', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: `Signature placed on ${pages} page${pages === 1 ? '' : 's'}.`,
        details: [
          'This is a visual (image) signature. It is not a certificate-based digital signature and does not cryptographically prove identity or detect later changes.',
        ],
      }
    })
  }

  const placed = history.elements.some((el) => el.kind === 'image')

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Sign again" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <p className="tool-notice is-info">
            Visual signature only — an image of your signature placed on the page. For legally binding e-signatures that require certificates (e.g. PAdES / qualified signatures), use a certificate-based signing service.
          </p>
          {!signature ? (
            <SignatureCreator onCreate={(sig) => { setSignature(sig); setTool('image') }} />
          ) : (
            <>
              <div className="editor-toolbar" role="toolbar" aria-label="Signing tools">
                <div className="editor-tools">
                  <button type="button" aria-pressed={tool === 'image'} onClick={() => setTool('image')} title="Place signature" aria-label="Place signature">
                    <Signature size={16} />
                  </button>
                  <button type="button" aria-pressed={tool === 'text'} onClick={() => setTool('text')} title="Add text (name, date)" aria-label="Add text">
                    <Type size={16} />
                  </button>
                  <button type="button" aria-pressed={tool === 'select'} onClick={() => setTool('select')} title="Select & move" aria-label="Select and move">
                    <MousePointer2 size={16} />
                  </button>
                  <button type="button" disabled={!selectedId} onClick={() => { history.change(history.elements.filter((el) => el.id !== selectedId), true); setSelectedId(null) }} aria-label="Delete selected" title="Delete selected">
                    <Trash2 size={16} />
                  </button>
                </div>
                <img className="sig-preview" src={signature.url} alt="Your signature" />
                <button type="button" className="chip" onClick={() => setSignature(null)}>
                  New signature
                </button>
              </div>
              <div className="editor-pager">
                <button type="button" className="icon-ghost" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={16} />
                </button>
                <span>
                  Page {page + 1} of {pageCount}
                </span>
                <button type="button" className="icon-ghost" aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={16} />
                </button>
                <span className="muted">{tool === 'image' ? 'Click where the signature should go.' : tool === 'text' ? 'Click to add text such as a date.' : 'Drag to move, corner to resize.'}</span>
              </div>
              <PageEditor
                doc={source.doc}
                page={page}
                elements={history.elements}
                onChange={history.change}
                tool={tool}
                style={{ color: '#111111', strokeWidth: 2, fontSize: 12, fill: null, opacity: 1 }}
                selectedId={selectedId}
                onSelect={setSelectedId}
                pendingImage={signature}
                onPlaced={() => setTool('select')}
              />
              <div className="tool-options">
                <Segmented
                  label="Pages"
                  value={repeat}
                  onChange={setRepeat}
                  options={[
                    { value: 'placed', label: 'Only where placed' },
                    { value: 'all', label: 'Same spot on every page' },
                    { value: 'range', label: 'Same spot on some pages' },
                  ]}
                />
                {repeat === 'range' && (
                  <Field label="Pages" hint="e.g. 1, 3-5" error={parsed?.error}>
                    <input value={range} onChange={(e) => setRange(e.target.value)} />
                  </Field>
                )}
              </div>
            </>
          )}
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={save} />
          <RunButton disabled={!placed || Boolean(parsed?.error) || (repeat === 'range' && !parsed?.indices?.length) || run.busy} onClick={save}>
            Sign & download
          </RunButton>
        </>
      )}
    </div>
  )
}
