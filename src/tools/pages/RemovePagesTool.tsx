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
import { removePages } from '../../lib/pdf/pages'
import { toBlob, withSuffix } from '../../lib/files'

export default function RemovePagesTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [pages, setPages] = useState<number[]>([])
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const removesAll = pageCount > 0 && pages.length >= pageCount

  function remove() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Removing pages…')
      const bytes = await removePages(source.bytes, pages, source.password)
      const left = pageCount - pages.length
      return {
        outputs: [{ name: withSuffix(source.file.name, '-trimmed', 'pdf'), blob: toBlob(bytes, 'application/pdf'), note: `${left} pages` }],
        summary: `Removed ${pages.length} page${pages.length === 1 ? '' : 's'}; ${left} remain.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Remove other pages" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); setPages([]); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <PageSelector doc={source.doc} pageCount={pageCount} value={pages} onChange={setPages} tone="remove" label="Pages to remove" />
          {removesAll && (
            <p className="field-error" role="alert">
              You selected every page. A PDF needs at least one page — deselect at least one.
            </p>
          )}
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={remove} />
          <RunButton disabled={pages.length === 0 || removesAll || run.busy} onClick={remove}>
            Remove {pages.length || ''} page{pages.length === 1 ? '' : 's'}
          </RunButton>
        </>
      )}
    </div>
  )
}
