import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { withSuffix } from '../../lib/files'

export default function PdfToWordTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()

  function convert() {
    if (source.status !== 'ready') return
    void run.start(async ({ progress, signal }) => {
      const { pdfToDocx } = await import('../../lib/convert/pdfToDocx')
      const result = await pdfToDocx(source.doc, (done, total) => progress({ done, total, label: 'Reading page layout…' }), signal)
      progress({ label: 'Writing the Word document…' })
      return {
        outputs: [{ name: withSuffix(source.file.name, '', 'docx'), blob: result.blob, note: `${result.pages} pages` }],
        summary: `Created an editable Word document with ${result.paragraphs} paragraphs from ${result.pages} pages.`,
        details: [
          'Kept: text, paragraphs, headings (detected from font size), bold and italic, page breaks, right-to-left text.',
          'Not kept: images, multi-column layout, exact positions and table borders. Tables become text.',
        ],
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Convert another file" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <p className="muted">
            Best for text documents such as reports, articles and letters. Scanned PDFs need OCR first. Layout-heavy files (brochures, forms) will lose their design.
          </p>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={convert} />
          <RunButton disabled={run.busy} onClick={convert}>
            Convert to Word
          </RunButton>
        </>
      )}
    </div>
  )
}
