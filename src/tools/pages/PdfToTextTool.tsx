import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton, Segmented } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { extractText } from '../../lib/pdf/pdfjs'
import { withSuffix } from '../../lib/files'

export default function PdfToTextTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [markers, setMarkers] = useState<'yes' | 'no'>('yes')
  const [preview, setPreview] = useState('')

  function convert() {
    if (source.status !== 'ready') return
    void run.start(async ({ progress, signal }) => {
      const pages = await extractText(source.doc, (done, total) => progress({ done, total, label: 'Extracting text…' }), signal)
      const chars = pages.reduce((sum, p) => sum + p.text.length, 0)
      if (chars < 20) {
        throw new Error('No selectable text was found — this PDF is probably scanned. Use OCR PDF to recognise the text first.')
      }
      const text = pages
        .map((p) => (markers === 'yes' ? `--- Page ${p.page} ---\n${p.text}` : p.text))
        .join('\n\n')
      setPreview(text.slice(0, 6000))
      const empty = pages.filter((p) => !p.text.trim()).length
      return {
        outputs: [{ name: withSuffix(source.file.name, '', 'txt'), blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) }],
        summary: `Extracted ${chars.toLocaleString()} characters from ${pages.length} pages.`,
        details: empty ? [`${empty} page${empty === 1 ? '' : 's'} had no selectable text (images or scans).`] : undefined,
      }
    })
  }

  if (run.phase === 'success' && run.result) {
    return (
      <div className="tool-stack">
        <ResultPanel result={run.result} onReset={run.reset} resetLabel="Extract again" />
        <section className="text-preview" aria-label="Text preview">
          <h2>Preview</h2>
          <pre>{preview}{preview.length >= 6000 ? '\n…' : ''}</pre>
        </section>
      </div>
    )
  }
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="tool-options">
            <Segmented
              label="Page markers"
              value={markers}
              onChange={setMarkers}
              options={[
                { value: 'yes', label: 'Include “--- Page N ---”' },
                { value: 'no', label: 'Plain text only' },
              ]}
            />
          </div>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={convert} />
          <RunButton disabled={run.busy} onClick={convert}>
            Extract text
          </RunButton>
        </>
      )}
    </div>
  )
}
