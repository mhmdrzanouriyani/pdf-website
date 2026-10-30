import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton } from '../../components/tools/controls'
import { PageSelector } from '../../components/tools/PageSelector'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { extractPages } from '../../lib/pdf/pages'
import { toBlob, withSuffix } from '../../lib/files'
import { formatIndices } from '../../lib/pageRanges'

export default function ExtractPagesTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [pages, setPages] = useState<number[]>([])

  function extract() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Extracting pages…')
      const bytes = await extractPages(source.bytes, pages, source.password)
      return {
        outputs: [{ name: withSuffix(source.file.name, '-extract', 'pdf'), blob: toBlob(bytes, 'application/pdf'), note: `pages ${formatIndices(pages)}` }],
        summary: `Extracted ${pages.length} page${pages.length === 1 ? '' : 's'} into a new PDF.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Extract other pages" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); setPages([]); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <PageSelector doc={source.doc} pageCount={source.pageCount} value={pages} onChange={setPages} label="Pages to extract" />
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={extract} />
          <RunButton disabled={pages.length === 0 || run.busy} onClick={extract}>
            Extract {pages.length || ''} page{pages.length === 1 ? '' : 's'}
          </RunButton>
        </>
      )}
    </div>
  )
}
