import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented, checkRange } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { cropPages, type CropMargins } from '../../lib/pdf/pages'
import { toBlob, withSuffix } from '../../lib/files'
import type { PDFDocumentProxy } from '../../lib/pdf/pdfjs'

const PREVIEW_WIDTH = 420
type Side = keyof CropMargins

function CropCanvas({ doc, pageNumber, margins, onChange }: { doc: PDFDocumentProxy; pageNumber: number; margins: CropMargins; onChange: (m: CropMargins) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: PREVIEW_WIDTH, h: PREVIEW_WIDTH * 1.3, scale: 1 })
  const drag = useRef<{ side: Side; startX: number; startY: number; start: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void } | null = null
    ;(async () => {
      const page = await doc.getPage(pageNumber)
      const base = page.getViewport({ scale: 1 })
      const scale = PREVIEW_WIDTH / base.width
      const viewport = page.getViewport({ scale: scale * (window.devicePixelRatio || 1) })
      const canvas = canvasRef.current
      if (!canvas || cancelled) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      setSize({ w: PREVIEW_WIDTH, h: base.height * scale, scale })
      const render = page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport })
      task = render
      await render.promise.catch(() => undefined)
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, pageNumber])

  function onPointerDown(side: Side) {
    return (event: ReactPointerEvent) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { side, startX: event.clientX, startY: event.clientY, start: margins[side] }
    }
  }

  function onPointerMove(event: ReactPointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (event.clientX - d.startX) / size.scale
    const dy = (event.clientY - d.startY) / size.scale
    const delta = d.side === 'left' ? dx : d.side === 'right' ? -dx : d.side === 'top' ? dy : -dy
    const pageW = size.w / size.scale
    const pageH = size.h / size.scale
    const opposite = d.side === 'left' ? margins.right : d.side === 'right' ? margins.left : d.side === 'top' ? margins.bottom : margins.top
    const max = (d.side === 'left' || d.side === 'right' ? pageW : pageH) - opposite - 20
    onChange({ ...margins, [d.side]: Math.round(Math.min(max, Math.max(0, d.start + delta))) })
  }

  const s = size.scale
  const box = { left: margins.left * s, top: margins.top * s, right: margins.right * s, bottom: margins.bottom * s }
  return (
    <div className="crop-stage" style={{ width: size.w, height: size.h }} onPointerMove={onPointerMove} onPointerUp={() => (drag.current = null)}>
      <canvas ref={canvasRef} style={{ width: size.w, height: size.h }} aria-hidden="true" />
      <div className="crop-shade" style={{ clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${box.left}px ${box.top}px, ${box.left}px ${size.h - box.bottom}px, ${size.w - box.right}px ${size.h - box.bottom}px, ${size.w - box.right}px ${box.top}px, ${box.left}px ${box.top}px)` }} />
      <div className="crop-box" style={{ left: box.left, top: box.top, right: box.right, bottom: box.bottom }}>
        {(['top', 'right', 'bottom', 'left'] as Side[]).map((side) => (
          <span key={side} className={`crop-handle is-${side}`} onPointerDown={onPointerDown(side)} aria-hidden="true" />
        ))}
      </div>
    </div>
  )
}

export default function CropTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [margins, setMargins] = useState<CropMargins>({ top: 36, right: 36, bottom: 36, left: 36 })
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('1')
  const [previewPage, setPreviewPage] = useState(1)
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const parsed = scope === 'range' && pageCount ? checkRange(range, pageCount) : null

  function crop() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Cropping pages…')
      const pages = scope === 'all' ? null : (parsed?.indices ?? [])
      const bytes = await cropPages(source.bytes, margins, pages, source.password)
      const count = pages ? pages.length : pageCount
      return {
        outputs: [{ name: withSuffix(source.file.name, '-cropped', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: `Cropped ${count} page${count === 1 ? '' : 's'}.`,
        details: ['The crop sets the page’s visible area (CropBox/MediaBox). Content outside it is hidden, not deleted — use Redact PDF to remove sensitive content.'],
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Adjust crop" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="crop-layout">
            <div>
              <CropCanvas doc={source.doc} pageNumber={previewPage} margins={margins} onChange={setMargins} />
              <p className="muted">Drag the edges of the box, or type exact margins in points (72 pt = 1 inch).</p>
            </div>
            <div className="tool-options">
              <Field label="Preview page">
                <input type="number" min={1} max={pageCount} value={previewPage} onChange={(e) => setPreviewPage(Math.min(pageCount, Math.max(1, Number(e.target.value) || 1)))} />
              </Field>
              {(['top', 'right', 'bottom', 'left'] as Side[]).map((side) => (
                <Field key={side} label={`${side[0].toUpperCase()}${side.slice(1)} margin (pt)`}>
                  <input type="number" min={0} max={2000} value={margins[side]} onChange={(e) => setMargins((m) => ({ ...m, [side]: Math.max(0, Number(e.target.value) || 0) }))} />
                </Field>
              ))}
              <Segmented label="Apply to" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All pages' }, { value: 'range', label: 'Some pages' }]} />
              {scope === 'range' && (
                <Field label="Pages" error={parsed?.error}>
                  <input value={range} onChange={(e) => setRange(e.target.value)} />
                </Field>
              )}
            </div>
          </div>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={crop} />
          <RunButton disabled={Boolean(parsed?.error) || run.busy} onClick={crop}>
            Crop PDF
          </RunButton>
        </>
      )}
    </div>
  )
}
