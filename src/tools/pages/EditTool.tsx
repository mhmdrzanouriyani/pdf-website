import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Circle, Highlighter, ImagePlus, Minus, MousePointer2, Pencil, Redo2, Square, Trash2, Type, Undo2 } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton } from '../../components/tools/controls'
import { PageEditor, measureText, type EditorStyle, type EditorTool, type PendingImage } from '../../components/editor/PageEditor'
import { useEditorHistory } from '../../components/editor/useEditorHistory'
import { prepareForExport } from '../../components/editor/prepareExport'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { applyElements } from '../../lib/pdf/annotate'
import { readBytes, toBlob, validateFile, withSuffix } from '../../lib/files'
import { useToast } from '../../state/ToastContext'

const TOOLS: { id: EditorTool; label: string; icon: typeof Type }[] = [
  { id: 'select', label: 'Select & move', icon: MousePointer2 },
  { id: 'text', label: 'Text', icon: Type },
  { id: 'rect', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
  { id: 'draw', label: 'Draw', icon: Pencil },
  { id: 'highlight', label: 'Highlight', icon: Highlighter },
  { id: 'image', label: 'Image', icon: ImagePlus },
]

export default function EditTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const { notify } = useToast()
  const history = useEditorHistory()
  const [tool, setTool] = useState<EditorTool>('select')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [style, setStyle] = useState<EditorStyle>({ color: '#111111', strokeWidth: 2, fontSize: 16, fill: null, opacity: 1 })
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null)
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const selected = history.elements.find((el) => el.id === selectedId) ?? null

  useEffect(() => {
    history.reset()
    setPage(0)
    setSelectedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  // Keyboard shortcuts: undo/redo, delete selected.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) history.redo()
        else history.undo()
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        history.redo()
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        history.change(history.elements.filter((el) => el.id !== selectedId), true)
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [history, selectedId])

  function patchSelected(patch: Partial<EditorStyle>) {
    setStyle((s) => ({ ...s, ...patch }))
    if (!selected) return
    const next = history.elements.map((el) => {
      if (el.id !== selected.id) return el
      const updated = { ...el, ...patch }
      if (el.kind === 'text' && patch.fontSize) Object.assign(updated, measureText(el.text ?? '', patch.fontSize))
      return updated
    })
    history.change(next, true)
  }

  async function pickImage(fileList: FileList | null) {
    const picked = fileList?.[0]
    if (!picked) return
    try {
      const kind = (await validateFile(picked, ['png', 'jpg'], 15 * 1024 * 1024)) as 'png' | 'jpg'
      const bytes = await readBytes(picked)
      const url = URL.createObjectURL(picked)
      const img = new Image()
      img.src = url
      await img.decode()
      setPendingImage({ bytes, kind, url, aspect: img.naturalWidth / img.naturalHeight })
      setTool('image')
      notify('Click on the page to place the image.', 'info')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'That image could not be used.', 'error')
    }
  }

  function save() {
    if (source.status !== 'ready') return
    const elements = history.elements
    void run.start(async ({ processing }) => {
      processing('Preparing your edits…')
      const prepared = await prepareForExport(elements)
      processing('Writing the PDF…')
      const bytes = await applyElements(source.bytes, prepared, source.password)
      const pages = new Set(elements.map((el) => el.page)).size
      return {
        outputs: [{ name: withSuffix(source.file.name, '-edited', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: `Added ${elements.length} element${elements.length === 1 ? '' : 's'} on ${pages} page${pages === 1 ? '' : 's'}.`,
        details: ['Your additions are drawn on top of the original pages. Existing text in the PDF was not rewritten.'],
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Keep editing" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="editor-toolbar" role="toolbar" aria-label="Editing tools">
            <div className="editor-tools">
              {TOOLS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tool === t.id}
                  aria-label={t.label}
                  title={t.label}
                  onClick={() => {
                    if (t.id === 'image') {
                      document.getElementById('editor-image-input')?.click()
                      return
                    }
                    setTool(t.id)
                  }}
                >
                  <t.icon size={16} />
                </button>
              ))}
              <input id="editor-image-input" type="file" accept="image/png,image/jpeg" className="sr-only" tabIndex={-1} onChange={(e) => { void pickImage(e.target.files); e.target.value = '' }} />
            </div>
            <div className="editor-props">
              <label>
                <span className="sr-only">Color</span>
                <input type="color" value={selected?.color ?? style.color} onChange={(e) => patchSelected({ color: e.target.value })} aria-label="Color" />
              </label>
              {(selected?.kind === 'text' || (!selected && tool === 'text')) && (
                <label>
                  Size
                  <input type="number" min={6} max={144} value={selected?.fontSize ?? style.fontSize} onChange={(e) => patchSelected({ fontSize: Math.max(6, Number(e.target.value) || 6) })} />
                </label>
              )}
              {(['rect', 'ellipse', 'line', 'draw'] as string[]).includes(selected?.kind ?? tool) && (
                <label>
                  Stroke
                  <input type="number" min={0.5} max={20} step={0.5} value={selected?.strokeWidth ?? style.strokeWidth} onChange={(e) => patchSelected({ strokeWidth: Number(e.target.value) || 1 })} />
                </label>
              )}
              {(['rect', 'ellipse'] as string[]).includes(selected?.kind ?? tool) && (
                <label className="check">
                  <input type="checkbox" checked={Boolean(selected ? selected.fill : style.fill)} onChange={(e) => patchSelected({ fill: e.target.checked ? (selected?.color ?? style.color) : null })} /> Fill
                </label>
              )}
              <label>
                Opacity
                <input type="range" min={10} max={100} value={Math.round((selected?.opacity ?? style.opacity) * 100)} onChange={(e) => patchSelected({ opacity: Number(e.target.value) / 100 })} />
              </label>
            </div>
            <div className="editor-history">
              <button type="button" aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!history.canUndo} onClick={history.undo}>
                <Undo2 size={16} />
              </button>
              <button type="button" aria-label="Redo (Ctrl+Shift+Z)" title="Redo" disabled={!history.canRedo} onClick={history.redo}>
                <Redo2 size={16} />
              </button>
              <button
                type="button"
                aria-label="Delete selected element"
                title="Delete (Del)"
                disabled={!selected}
                onClick={() => {
                  history.change(history.elements.filter((el) => el.id !== selectedId), true)
                  setSelectedId(null)
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="editor-pager">
            <button type="button" className="icon-ghost" aria-label="Previous page" disabled={page === 0} onClick={() => { setPage((p) => p - 1); setSelectedId(null) }}>
              <ChevronLeft size={16} />
            </button>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <button type="button" className="icon-ghost" aria-label="Next page" disabled={page >= pageCount - 1} onClick={() => { setPage((p) => p + 1); setSelectedId(null) }}>
              <ChevronRight size={16} />
            </button>
            <span className="muted">
              {tool === 'select' ? 'Click an element to select it. Drag to move, corner to resize, double-click text to edit.' : tool === 'image' ? (pendingImage ? 'Click to place the image.' : 'Choose an image first.') : 'Click and drag on the page.'}
            </span>
          </div>

          <PageEditor
            doc={source.doc}
            page={page}
            elements={history.elements}
            onChange={history.change}
            tool={tool}
            style={style}
            selectedId={selectedId}
            onSelect={setSelectedId}
            pendingImage={pendingImage}
            onPlaced={() => setTool('select')}
          />

          <p className="muted">PDFLY adds new content on top of your pages. It does not rewrite text that is already in the PDF — to hide existing content permanently, use Redact PDF.</p>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={save} />
          <RunButton disabled={history.elements.length === 0 || run.busy} onClick={save}>
            Save edited PDF
          </RunButton>
        </>
      )}
    </div>
  )
}
