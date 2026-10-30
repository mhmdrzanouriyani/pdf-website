import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop, type AcceptedFile } from '../../components/tools/FileDrop'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { Field, RunButton, Segmented } from '../../components/tools/controls'
import { useToolRun } from '../../hooks/useToolRun'
import { imagesToPdf, PAGE_SIZES, type PageSizeId } from '../../lib/pdf/images'
import { readBytes, toBlob } from '../../lib/files'
import { formatBytes, LIMITS } from '../../config/limits'

type Item = { id: string; file: File; kind: 'jpg' | 'png'; url: string }
let n = 0

function ImagesToPdf({ kind }: ToolProps & { kind: 'jpg' | 'png' }) {
  const run = useToolRun()
  const [items, setItems] = useState<Item[]>([])
  const [pageSize, setPageSize] = useState<PageSizeId>('a4')
  const [orientation, setOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')
  const [margin, setMargin] = useState<'0' | '18' | '36'>('18')
  const [fit, setFit] = useState<'contain' | 'cover' | 'stretch'>('contain')

  // Revoke preview URLs when items are removed or the tool unmounts.
  const urls = useMemo(() => items.map((item) => item.url), [items])
  useEffect(() => () => urls.forEach((url) => URL.revokeObjectURL(url)), [urls])

  function add(files: AcceptedFile[]) {
    run.reset()
    setItems((list) =>
      [
        ...list,
        ...files.map(({ file, kind: k }) => ({ id: `i${++n}`, file, kind: k as 'jpg' | 'png', url: URL.createObjectURL(file) })),
      ].slice(0, LIMITS.maxFiles),
    )
  }

  function move(from: number, to: number) {
    setItems((list) => {
      if (to < 0 || to >= list.length) return list
      const next = [...list]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  function convert() {
    void run.start(async ({ progress, signal }) => {
      const inputs = []
      for (const [i, item] of items.entries()) {
        if (signal.aborted) throw new DOMException('Cancelled', 'AbortError')
        progress({ done: i, total: items.length, label: `Reading ${item.file.name}…` })
        inputs.push({ bytes: await readBytes(item.file), kind: item.kind })
      }
      progress({ label: 'Building the PDF…' })
      const bytes = await imagesToPdf(inputs, { pageSize, orientation, margin: Number(margin), fit })
      return {
        outputs: [{ name: items.length === 1 ? `${items[0].file.name.replace(/\.[a-z]+$/i, '')}.pdf` : 'images.pdf', blob: toBlob(bytes, 'application/pdf'), note: `${items.length} pages` }],
        summary: `Created a ${items.length}-page PDF from your images.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) {
    return <ResultPanel result={run.result} onReset={() => { run.reset(); setItems([]) }} resetLabel="Convert other images" />
  }

  if (items.length === 0) return <FileDrop accepts={[kind]} multiple onFiles={add} />

  return (
    <div className="tool-stack">
      <ol className="image-list" aria-label="Images in page order">
        {items.map((item, index) => (
          <li key={item.id}>
            <img src={item.url} alt="" />
            <span className="image-meta">
              <strong>
                {index + 1}. {item.file.name}
              </strong>
              <em>{formatBytes(item.file.size)}</em>
            </span>
            <span className="image-actions">
              <button type="button" className="icon-ghost" aria-label={`Move ${item.file.name} earlier`} disabled={index === 0} onClick={() => move(index, index - 1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" className="icon-ghost" aria-label={`Move ${item.file.name} later`} disabled={index === items.length - 1} onClick={() => move(index, index + 1)}>
                <ArrowDown size={14} />
              </button>
              <button type="button" className="icon-ghost" aria-label={`Remove ${item.file.name}`} onClick={() => setItems((list) => list.filter((i) => i.id !== item.id))}>
                <X size={14} />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <FileDrop accepts={[kind]} multiple compact onFiles={add} label="Add more images" />
      <div className="tool-options">
        <Field label="Page size">
          <select value={pageSize} onChange={(e) => setPageSize(e.target.value as PageSizeId)}>
            {Object.entries(PAGE_SIZES).map(([id, size]) => (
              <option key={id} value={id}>
                {size.label}
              </option>
            ))}
            <option value="fit">Same as image</option>
          </select>
        </Field>
        {pageSize !== 'fit' && (
          <>
            <Segmented
              label="Orientation"
              value={orientation}
              onChange={setOrientation}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'portrait', label: 'Portrait' },
                { value: 'landscape', label: 'Landscape' },
              ]}
            />
            <Segmented
              label="Margin"
              value={margin}
              onChange={setMargin}
              options={[
                { value: '0', label: 'None' },
                { value: '18', label: 'Small' },
                { value: '36', label: 'Large' },
              ]}
            />
            <Segmented
              label="Image fit"
              value={fit}
              onChange={setFit}
              options={[
                { value: 'contain', label: 'Fit' },
                { value: 'cover', label: 'Fill (crop)' },
                { value: 'stretch', label: 'Stretch' },
              ]}
            />
          </>
        )}
      </div>
      <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={convert} />
      <RunButton disabled={items.length === 0 || run.busy} onClick={convert}>
        Create PDF ({items.length} page{items.length === 1 ? '' : 's'})
      </RunButton>
    </div>
  )
}

export function JpgToPdf(props: ToolProps) {
  return <ImagesToPdf {...props} kind="jpg" />
}

export function PngToPdf(props: ToolProps) {
  return <ImagesToPdf {...props} kind="png" />
}
