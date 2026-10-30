import { useEffect, useState } from 'react'
import { Copy, RotateCcw, RotateCw, Trash2, Undo2 } from 'lucide-react'
import type { ToolProps } from '../registry'
import { FileDrop } from '../../components/tools/FileDrop'
import { PdfFileBar } from '../../components/tools/PdfFileBar'
import { RunStatus } from '../../components/tools/RunStatus'
import { ResultPanel } from '../../components/tools/ResultPanel'
import { RunButton } from '../../components/tools/controls'
import { PageGrid, makeItems, type GridItem } from '../../components/tools/PageGrid'
import { useSinglePdf } from '../../hooks/useSinglePdf'
import { useToolRun } from '../../hooks/useToolRun'
import { organizePages } from '../../lib/pdf/pages'
import { toBlob, withSuffix } from '../../lib/files'

let dup = 0

export default function OrganizeTool({ docIds }: ToolProps) {
  const { file, setFile, source, submitPassword } = useSinglePdf(docIds)
  const run = useToolRun()
  const [items, setItems] = useState<GridItem[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const pageCount = source.status === 'ready' ? source.pageCount : 0

  useEffect(() => {
    setItems(makeItems(pageCount))
    setSelected(new Set())
  }, [pageCount, source.status === 'ready' ? source.doc : null])

  const changed =
    items.length !== pageCount || items.some((item, i) => item.source !== i || item.rotation !== 0)

  function rotate(keys: Set<string>, delta: number) {
    setItems((list) => list.map((item) => (keys.has(item.key) ? { ...item, rotation: (((item.rotation + delta) % 360) + 360) % 360 } : item)))
  }

  function remove(keys: Set<string>) {
    setItems((list) => list.filter((item) => !keys.has(item.key)))
    setSelected(new Set())
  }

  function duplicate(keys: Set<string>) {
    setItems((list) => list.flatMap((item) => (keys.has(item.key) ? [item, { ...item, key: `d${++dup}` }] : [item])))
  }

  function save() {
    if (source.status !== 'ready') return
    void run.start(async ({ processing }) => {
      processing('Saving the new page order…')
      const bytes = await organizePages(source.bytes, items.map(({ source: s, rotation }) => ({ source: s, rotation })), source.password)
      return {
        outputs: [{ name: withSuffix(source.file.name, '-organized', 'pdf'), blob: toBlob(bytes, 'application/pdf'), note: `${items.length} pages` }],
        summary: `Saved ${items.length} page${items.length === 1 ? '' : 's'} in your order.`,
      }
    })
  }

  if (run.phase === 'success' && run.result) return <ResultPanel result={run.result} onReset={run.reset} resetLabel="Keep organizing" />
  if (!file) return <FileDrop accepts={['pdf']} onFiles={([f]) => setFile(f.file)} />

  return (
    <div className="tool-stack">
      <PdfFileBar source={source} onClear={() => { setFile(null); run.reset() }} onPassword={submitPassword} disabled={run.busy} />
      {source.status === 'ready' && (
        <>
          <div className="grid-toolbar" role="toolbar" aria-label="Selected pages">
            <span>{selected.size ? `${selected.size} selected` : 'Click pages to select · drag to reorder · Shift+click for ranges'}</span>
            <button type="button" className="chip" onClick={() => setSelected(new Set(items.map((i) => i.key)))}>
              Select all
            </button>
            {selected.size > 0 && (
              <>
                <button type="button" className="chip" onClick={() => rotate(selected, -90)}>
                  <RotateCcw size={12} /> Rotate left
                </button>
                <button type="button" className="chip" onClick={() => rotate(selected, 90)}>
                  <RotateCw size={12} /> Rotate right
                </button>
                <button type="button" className="chip" onClick={() => duplicate(selected)}>
                  <Copy size={12} /> Duplicate
                </button>
                <button type="button" className="chip" disabled={selected.size >= items.length} onClick={() => remove(selected)}>
                  <Trash2 size={12} /> Delete
                </button>
                <button type="button" className="chip" onClick={() => setSelected(new Set())}>
                  Clear selection
                </button>
              </>
            )}
            {changed && (
              <button type="button" className="chip" onClick={() => { setItems(makeItems(pageCount)); setSelected(new Set()) }}>
                <Undo2 size={12} /> Reset
              </button>
            )}
          </div>
          <PageGrid
            doc={source.doc}
            items={items}
            selected={selected}
            onSelectionChange={setSelected}
            onReorder={setItems}
            label="Pages — drag or use Alt+arrow keys to reorder"
            renderActions={(item) => (
              <>
                <button type="button" aria-label={`Rotate page ${item.source + 1} left`} onClick={() => rotate(new Set([item.key]), -90)}>
                  <RotateCcw size={12} />
                </button>
                <button type="button" aria-label={`Rotate page ${item.source + 1} right`} onClick={() => rotate(new Set([item.key]), 90)}>
                  <RotateCw size={12} />
                </button>
                <button type="button" aria-label={`Duplicate page ${item.source + 1}`} onClick={() => duplicate(new Set([item.key]))}>
                  <Copy size={12} />
                </button>
                <button type="button" aria-label={`Delete page ${item.source + 1}`} disabled={items.length <= 1} onClick={() => remove(new Set([item.key]))}>
                  <Trash2 size={12} />
                </button>
              </>
            )}
          />
          <RunStatus phase={run.phase} progress={run.progress} error={run.error} onCancel={run.cancel} onRetry={save} />
          <RunButton disabled={!changed || items.length === 0 || run.busy} onClick={save}>
            {changed ? `Save PDF (${items.length} pages)` : 'Make a change to save'}
          </RunButton>
        </>
      )}
    </div>
  )
}
