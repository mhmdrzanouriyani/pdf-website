import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented, checkRange } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { nextFrame, throwIfAborted, useToolRun, type ToolOutput } from '../../hooks/useToolRun'
import { canvasToBlob, releaseCanvas, renderPageToCanvas, safeScale } from '../../lib/pdf/pdfjs'
import { baseName } from '../../lib/files'
import { LIMITS } from '../../config/limits'

function PdfToImage({ docIds, format }: ToolProps & { format: 'jpg' | 'png' }) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('1')
  const [dpi, setDpi] = useState('150')
  const [quality, setQuality] = useState(85)
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const parsed = scope === 'range' && pageCount ? checkRange(range, pageCount) : null
  const indices = scope === 'all' ? Array.from({ length: pageCount }, (_, i) => i) : (parsed?.indices ?? [])
  const tooMany = indices.length > LIMITS.maxRasterPages

  function convert() {
    if (source.status !== 'ready') return
    const doc = source.doc
    const name = baseName(source.file.name)
    const pad = String(pageCount).length
    void run.start(async ({ signal, progress }) => {
      const outputs: ToolOutput[] = []
      const mime = format === 'jpg' ? 'image/jpeg' : 'image/png'
      for (const [i, index] of indices.entries()) {
        throwIfAborted(signal)
        progress({ done: i, total: indices.length, label: `Rendering page ${index + 1}…` })
        await nextFrame()
        const page = await doc.getPage(index + 1)
        const scale = safeScale(page, Number(dpi) / 72)
        const { canvas } = await renderPageToCanvas(page, scale, { signal })
        const blob = await canvasToBlob(canvas, mime, format === 'jpg' ? quality / 100 : undefined)
        releaseCanvas(canvas)
        page.cleanup()
        outputs.push({
          name: `${name}-page-${String(index + 1).padStart(pad, '0')}.${format}`,
          blob,
          note: `${Math.round(scale * 72)} dpi`,
        })
      }
      progress({ done: indices.length, total: indices.length, label: 'Done' })
      return { outputs, summary: `Converted ${outputs.length} page${outputs.length === 1 ? '' : 's'} to ${format.toUpperCase()}.` }
    })
  }

  if (run.phase === 'success' && run.result) {
    return <ResultPanel result={run.result} onReset={run.reset} zipName={`${baseName(file?.name ?? 'pages')}-${format}.zip`} resetLabel="Convert again" />
  }
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="tool-options">
            <Segmented
              label="Pages"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: `All ${pageCount}` },
                { value: 'range', label: 'Page or range' },
              ]}
            />
            {scope === 'range' && (
              <Field label="Page or range" hint="e.g. 3 or 2-5" error={parsed?.error}>
                <input value={range} onChange={(e) => setRange(e.target.value)} />
              </Field>
            )}
            <Field label="Resolution">
              <select value={dpi} onChange={(e) => setDpi(e.target.value)}>
                <option value="72">72 dpi — screen, small files</option>
                <option value="150">150 dpi — recommended</option>
                <option value="200">200 dpi — sharp</option>
                <option value="300">300 dpi — print</option>
              </select>
            </Field>
            {format === 'jpg' && (
              <Field label={`JPG quality: ${quality}%`}>
                <input type="range" min={50} max={98} value={quality} onChange={(e) => setQuality(Number(e.target.value))} />
              </Field>
            )}
          </div>
          {tooMany && (
            <p className="field-error" role="alert">
              That is {indices.length} pages. Convert at most {LIMITS.maxRasterPages} pages at a time.
            </p>
          )}
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={convert} />
          <RunButton disabled={indices.length === 0 || tooMany || run.busy} onClick={convert}>
            Convert {indices.length} page{indices.length === 1 ? '' : 's'} to {format.toUpperCase()}
          </RunButton>
        </>
      )}
    </div>
  )
}

export function PdfToJpg(props: ToolProps) {
  return <PdfToImage {...props} format="jpg" />
}

export function PdfToPng(props: ToolProps) {
  return <PdfToImage {...props} format="png" />
}
