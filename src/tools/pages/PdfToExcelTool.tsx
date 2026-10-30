import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton } from '../../components/tools/controls'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { withSuffix } from '../../lib/files'

export default function PdfToExcelTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()

  function convert() {
    if (source.status !== 'ready') return
    void run.start(async ({ progress, signal }) => {
      const [{ pdfToSheets }, { writeXlsx }] = await Promise.all([import('../../lib/convert/pdfToTables'), import('../../lib/xlsx')])
      const { sheets, multiColumnRows } = await pdfToSheets(source.doc, (done, total) => progress({ done, total, label: 'Detecting rows and columns…' }), signal)
      progress({ label: 'Writing the workbook…' })
      const blob = await writeXlsx(sheets)
      return {
        outputs: [{ name: withSuffix(source.file.name, '', 'xlsx'), blob, note: `${sheets.length} sheets` }],
        summary: `Created a workbook with one sheet per page (${sheets.length}).`,
        details: [
          multiColumnRows === 0
            ? 'No multi-column rows were detected — this PDF may not contain tables, so each line became one cell.'
            : `${multiColumnRows} rows were split into columns. Numbers were converted to numeric cells.`,
          'Detection is based on text positions: check merged cells, wrapped text and scanned tables (scans need OCR first).',
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
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={convert} />
          <RunButton disabled={run.busy} onClick={convert}>
            Convert to Excel
          </RunButton>
        </>
      )}
    </div>
  )
}
