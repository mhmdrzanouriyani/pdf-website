import { useState } from 'react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented, checkRange } from '../../components/tools/controls'
import { AnchorPicker } from '../../components/tools/AnchorPicker'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { addPageNumbers, formatPageLabel, type PageNumberOptions } from '../../lib/pdf/stamp'
import { toBlob, withSuffix } from '../../lib/files'

type Pos = NonNullable<PageNumberOptions['anchor']>
const POSITIONS: Pos[] = ['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right']
const PRESETS = ['{n}', 'Page {n}', 'Page {n} of {total}', '{n} / {total}', '- {n} -']

export default function PageNumbersTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [template, setTemplate] = useState('Page {n} of {total}')
  const [start, setStart] = useState(1)
  const [anchor, setAnchor] = useState<Pos>('bottom-center')
  const [fontSize, setFontSize] = useState(11)
  const [color, setColor] = useState('#111111')
  const [scope, setScope] = useState<'all' | 'range'>('all')
  const [range, setRange] = useState('2-')
  const pageCount = source.status === 'ready' ? source.pageCount : 0
  const parsed = scope === 'range' && pageCount ? checkRange(range, pageCount) : null
  const count = scope === 'all' ? pageCount : (parsed?.indices?.length ?? 0)
  const templateError = template.includes('{n}') ? null : 'Include {n} where the number should go.'

  function apply() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Numbering pages…')
      const bytes = await addPageNumbers(source.bytes, {
        template,
        start,
        anchor,
        fontSize,
        color,
        pages: scope === 'all' ? null : parsed?.indices,
        password: source.password,
      })
      return {
        outputs: [{ name: withSuffix(source.file.name, '-numbered', 'pdf'), blob: toBlob(bytes, 'application/pdf') }],
        summary: `Numbered ${count} page${count === 1 ? '' : 's'} (${formatPageLabel(template, start, start + count - 1)} … ${formatPageLabel(template, start + count - 1, start + count - 1)}).`,
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Change numbering" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="tool-options">
            <Field label="Format" hint={`Preview: “${formatPageLabel(template || '{n}', start, start + Math.max(count, 1) - 1)}”. Use {n} and {total}.`} error={templateError}>
              <input list="page-number-presets" value={template} maxLength={60} onChange={(e) => setTemplate(e.target.value)} />
              <datalist id="page-number-presets">
                {PRESETS.map((preset) => (
                  <option key={preset} value={preset} />
                ))}
              </datalist>
            </Field>
            <Field label="Start at">
              <input type="number" min={0} max={99999} value={start} onChange={(e) => setStart(Number(e.target.value) || 0)} />
            </Field>
            <AnchorPicker value={anchor} onChange={setAnchor} options={POSITIONS} />
            <Field label={`Font size: ${fontSize} pt`}>
              <input type="range" min={6} max={36} value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} />
            </Field>
            <Field label="Color">
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </Field>
            <Segmented label="Pages" value={scope} onChange={setScope} options={[{ value: 'all', label: 'All pages' }, { value: 'range', label: 'Some pages' }]} />
            {scope === 'range' && (
              <Field label="Pages to number" hint="e.g. 2- skips a cover page" error={parsed?.error}>
                <input value={range} onChange={(e) => setRange(e.target.value)} />
              </Field>
            )}
          </div>
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={apply} />
          <RunButton disabled={count === 0 || Boolean(templateError) || Boolean(parsed?.error) || run.busy} onClick={apply}>
            Add page numbers
          </RunButton>
        </>
      )}
    </div>
  )
}
