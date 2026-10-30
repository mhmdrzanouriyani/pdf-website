import { useMemo, useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented } from '../../components/tools/controls'
import { PageThumb } from '../../components/tools/PageThumb'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { parseRanges, PageRangeError, type PageRange } from '../../lib/pageRanges'
import { splitByRanges } from '../../lib/pdf/pages'
import { baseName, toBlob } from '../../lib/files'

type Mode = 'ranges' | 'every' | 'single'

export default function SplitTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [mode, setMode] = useState<Mode>('ranges')
  const [rangeText, setRangeText] = useState('')
  const [every, setEvery] = useState(2)
  const pageCount = source.status === 'ready' ? source.pageCount : 0

  const plan = useMemo((): { ranges: PageRange[]; error: string | null } => {
    if (!pageCount) return { ranges: [], error: null }
    if (mode === 'single') return { ranges: Array.from({ length: pageCount }, (_, i) => ({ start: i + 1, end: i + 1 })), error: null }
    if (mode === 'every') {
      const size = Math.max(1, Math.floor(every) || 1)
      const ranges: PageRange[] = []
      for (let start = 1; start <= pageCount; start += size) ranges.push({ start, end: Math.min(pageCount, start + size - 1) })
      return { ranges, error: null }
    }
    if (!rangeText.trim()) return { ranges: [], error: null }
    try {
      return { ranges: parseRanges(rangeText, pageCount), error: null }
    } catch (error) {
      return { ranges: [], error: error instanceof PageRangeError ? error.message : 'Invalid range.' }
    }
  }, [mode, rangeText, every, pageCount])

  function split() {
    if (source.status !== 'ready') return
    const name = baseName(source.file.name)
    void run.start(async ({ processing }) => {
      processing(`Creating ${plan.ranges.length} files…`)
      const parts = await splitByRanges(source.bytes, plan.ranges, source.password)
      return {
        outputs: parts.map((part) => ({ name: `${name}-${part.label}.pdf`, blob: toBlob(part.bytes, 'application/pdf'), note: part.label.replace('-', ' ') })),
        summary: `Split into ${parts.length} file${parts.length === 1 ? '' : 's'}.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) {
    return <ResultPanel result={run.result} onReset={run.reset} zipName={`${baseName(file?.name ?? 'split')}-split.zip`} resetLabel="Split again" />
  }

  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="tool-options">
            <Segmented
              label="How to split"
              value={mode}
              onChange={setMode}
              options={[
                { value: 'ranges', label: 'Custom ranges' },
                { value: 'every', label: 'Every N pages' },
                { value: 'single', label: 'Every page' },
              ]}
            />
            {mode === 'ranges' && (
              <Field label="Ranges" hint="Each range becomes a separate PDF, e.g. 1-3, 4-8, 9" error={plan.error}>
                <input value={rangeText} onChange={(e) => setRangeText(e.target.value)} placeholder={`e.g. 1-${Math.min(3, pageCount)}, ${Math.min(4, pageCount)}-${pageCount}`} />
              </Field>
            )}
            {mode === 'every' && (
              <Field label="Pages per file">
                <input type="number" min={1} max={pageCount} value={every} onChange={(e) => setEvery(Number(e.target.value))} />
              </Field>
            )}
          </div>

          {plan.ranges.length > 0 && (
            <section className="split-preview" aria-label="Preview of the files that will be created">
              <h2>
                {plan.ranges.length} file{plan.ranges.length === 1 ? '' : 's'} will be created
              </h2>
              <ul>
                {plan.ranges.slice(0, 60).map((range, i) => (
                  <li key={i}>
                    <div className="split-thumbs">
                      <PageThumb doc={source.doc} pageNumber={range.start} width={56} />
                      {range.end !== range.start && <PageThumb doc={source.doc} pageNumber={range.end} width={56} />}
                    </div>
                    <span>{range.start === range.end ? `Page ${range.start}` : `Pages ${range.start}–${range.end}`}</span>
                  </li>
                ))}
              </ul>
              {plan.ranges.length > 60 && <p className="muted">…and {plan.ranges.length - 60} more.</p>}
            </section>
          )}

          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={split} />
          <RunButton disabled={plan.ranges.length === 0 || Boolean(plan.error) || run.busy} onClick={split}>
            Split PDF
          </RunButton>
        </>
      )}
    </div>
  )
}
