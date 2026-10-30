import { useEffect, useMemo, useState } from 'react'
import type { PDFDocumentProxy } from '../../lib/pdf/pdfjs'
import { PageGrid, makeItems } from './PageGrid'
import { Field, checkRange } from './controls'
import { formatIndices } from '../../lib/pageRanges'

type PageSelectorProps = {
  doc: PDFDocumentProxy
  pageCount: number
  /** 0-based selected pages. */
  value: number[]
  onChange: (indices: number[]) => void
  tone?: 'select' | 'remove'
  label: string
  /** Rotation preview applied to selected pages (or all when previewAll). */
  previewRotation?: number
  previewAll?: boolean
}

/** Page picking by clicking thumbnails or typing ranges — both stay in sync. */
export function PageSelector({ doc, pageCount, value, onChange, tone = 'select', label, previewRotation = 0, previewAll = false }: PageSelectorProps) {
  const [text, setText] = useState(formatIndices(value))
  const [error, setError] = useState<string | null>(null)
  const base = useMemo(() => makeItems(pageCount), [pageCount])
  const selectedSet = useMemo(() => new Set(value.map((i) => `p${i}`)), [value])
  const items = useMemo(
    () => base.map((item) => ({ ...item, rotation: previewAll || selectedSet.has(item.key) ? previewRotation : 0 })),
    [base, previewRotation, previewAll, selectedSet],
  )

  // Keep the text box in sync when the selection changes by clicking.
  useEffect(() => {
    setText((current) => {
      const parsed = checkRange(current, pageCount)
      const same = parsed.indices && parsed.indices.length === value.length && parsed.indices.every((v, i) => v === value[i])
      return same ? current : formatIndices(value)
    })
  }, [value, pageCount])

  return (
    <div className="page-selector">
      <div className="page-selector-bar">
        <Field label={label} hint="Click pages or type ranges like 1-3, 7, 10-" error={error}>
          <input
            value={text}
            placeholder="e.g. 1-3, 7"
            onChange={(event) => {
              const next = event.target.value
              setText(next)
              if (!next.trim()) {
                setError(null)
                onChange([])
                return
              }
              const parsed = checkRange(next, pageCount)
              setError(parsed.error)
              if (parsed.indices) onChange(parsed.indices)
            }}
          />
        </Field>
        <div className="page-selector-quick">
          <button type="button" className="chip" onClick={() => onChange(base.map((_, i) => i))}>
            All
          </button>
          <button type="button" className="chip" onClick={() => onChange(base.map((_, i) => i).filter((i) => i % 2 === 0))}>
            Odd
          </button>
          <button type="button" className="chip" onClick={() => onChange(base.map((_, i) => i).filter((i) => i % 2 === 1))}>
            Even
          </button>
          <button type="button" className="chip" onClick={() => onChange([])}>
            None
          </button>
        </div>
      </div>
      <PageGrid
        doc={doc}
        items={items}
        selected={selectedSet}
        selectionTone={tone}
        onSelectionChange={(next) => {
          setError(null)
          onChange([...next].map((key) => Number(key.slice(1))).sort((a, b) => a - b))
        }}
        label={`${label} — ${value.length} of ${pageCount} selected`}
      />
    </div>
  )
}
