import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton, Segmented } from '../../components/tools/controls'
import { PageSelector } from '../../components/tools/PageSelector'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { rotatePages } from '../../lib/pdf/pages'
import { toBlob, withSuffix } from '../../lib/files'

export default function RotateTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [angle, setAngle] = useState<'90' | '180' | '270'>('90')
  const [scope, setScope] = useState<'all' | 'selected'>('all')
  const [pages, setPages] = useState<number[]>([])

  function rotate() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Rotating pages…')
      const targets = scope === 'all' ? null : pages
      const bytes = await rotatePages(source.bytes, Number(angle), targets, source.password)
      const count = targets ? targets.length : source.pageCount
      return {
        outputs: [{ name: withSuffix(source.file.name, '-rotated', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: `Rotated ${count} page${count === 1 ? '' : 's'} by ${angle}° clockwise.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Rotate again" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); setPages([]); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="tool-options">
            <Segmented
              label="Rotation (clockwise)"
              value={angle}
              onChange={setAngle}
              options={[
                { value: '90', label: '90° right' },
                { value: '180', label: '180°' },
                { value: '270', label: '90° left' },
              ]}
            />
            <Segmented
              label="Apply to"
              value={scope}
              onChange={setScope}
              options={[
                { value: 'all', label: 'All pages' },
                { value: 'selected', label: 'Selected pages' },
              ]}
            />
          </div>
          <PageSelector
            doc={source.doc}
            pageCount={source.pageCount}
            value={scope === 'all' ? [] : pages}
            onChange={(next) => {
              setScope('selected')
              setPages(next)
            }}
            label="Pages to rotate"
            previewRotation={Number(angle)}
            previewAll={scope === 'all'}
          />
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={rotate} />
          <RunButton disabled={(scope === 'selected' && pages.length === 0) || run.busy} onClick={rotate}>
            Rotate {scope === 'all' ? 'all pages' : `${pages.length} page${pages.length === 1 ? '' : 's'}`}
          </RunButton>
        </>
      )}
    </div>
  )
}
